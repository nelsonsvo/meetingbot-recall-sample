import express from 'express';
import { handleError, sanitize } from '../helpers/routing.js';
import { contextHeader, getAppContext } from '../helpers/cipher.js';
import { recallFetch } from '../helpers/recall.js';

import session from '../session.js';
import { zoomApp } from '../config.js';
import db from '../helpers/database.js';
import { anthropicFetch } from '../helpers/anthropic.js';

const router = express.Router();

/*
 * Gets the context of the Zoom App
 */
router.get('/context', async (req, res, next) => {
    try {
        sanitize(req);

        const header = req.header(contextHeader);

        const isZoom = !!(header && getAppContext(header));

        return res.json({
            isZoom,
        });
    } catch (e) {
        next(handleError(e));
    }
});

const validateAppContext = (req) => {
    const header = req.header(contextHeader);

    if (!header || !getAppContext(header)) {
        const e = new Error('Unauthorized');
        e.code = 401;
        throw e;
    }
};

/*
 * Send's a Recall Bot to start recording the call
 */
router.post('/start-recording', session, async (req, res, next) => {
    try {
        sanitize(req);
        validateAppContext(req);

        if (!req.body.meetingUrl) {
            return res.status(400).json({ error: 'Missing meetingUrl' });
        }

        console.log('recall bot start recording', req.body.meetingUrl);

        // @see https://recallai.readme.io/reference/bot_create
        const bot = await recallFetch('/api/v1/bot', {
            method: 'POST',
            body: JSON.stringify({
                bot_name: `${process.env.BOT_NAME}`,
                meeting_url: req.body.meetingUrl,
                recording_config: {
                    transcript: {
                        provider: {
                            gladia_v1_streaming: {},
                        },
                    },
                    realtime_endpoints: [
                        {
                            type: 'webhook',
                            url: `${zoomApp.publicUrl}/webhook/transcription?secret=${zoomApp.webhookSecret}`,
                            events: ['transcript.data'],
                        },
                    ],
                },

                /* Uncomment this to enable the bot to display an image.
                automatic_video_output: {
                    in_call_recording: {
                      kind: 'jpeg',
                      b64_data: 'YOUR-BASE64-JPEG-GOES-HERE'
                    }
                },
                */
                /* Uncomment this to enable the bot to play audio.
                automatic_audio_output: {
                    in_call_recording: {
                      data: {
                        kind: 'mp3',
                        b64_data: 'YOUR-BASE64-MP3-GOES-HERE'
                      }
                    }
                },
                */
                /* Uncomment this to make the bot send a chat message.
                chat: {
                    on_bot_join: {
                      send_to: 'everyone',
                      message: 'Hello world'
                    }
                },
                */
            }),
        });

        console.log('recall bot', bot);
        req.session.botId = bot.id;

        return res.json({
            botId: bot.id,
        });
    } catch (e) {
        next(handleError(e));
    }
});

/*
 * Tells the Recall Bot to stop recording the call
 */
router.post('/stop-recording', session, async (req, res, next) => {
    try {
        sanitize(req);
        validateAppContext(req);

        if (!req.session.botId) {
            return res.status(400).json({ error: 'Missing botId' });
        }

        await recallFetch(`/api/v1/bot/${req.session.botId}/leave_call`, {
            method: 'POST',
        });

        console.log('recall bot stopped');
        return res.json({});
    } catch (e) {
        next(handleError(e));
    }
});

/*
 * Gets the current state of the Recall Bot
 */
router.get('/recording-state', session, async (req, res, next) => {
    try {
        sanitize(req);
        validateAppContext(req);

        const botId = req.session.botId;

        if (!botId) {
            return res.status(400).json({ error: 'Missing botId' });
        }

        const bot = await recallFetch(`/api/v1/bot/${botId}`, {
            method: 'GET',
        });
        const latestStatus = bot.status_changes.slice(-1)[0].code;

        return res.json({
            state: latestStatus,
            transcript: db.transcripts[botId] || [],
        });
    } catch (e) {
        next(handleError(e));
    }
});

const PROMPTS = {
    _template: `
Human: You are a virtual sales and closing expert and you are providing insight based on the transcript for a sales call. You are diligent, polite and assertive.
Human: Here is the a transcript of the meeting, including the speaker's name:

Human: <transcript>
{{transcript}}
Human: </transcript>

Human: Only answer the following question directly, do not add any additional comments or information.
Human: {{prompt}}

Human: You are selling this product: {{product}}

Assistant:`,
    objection_handle:
        'Please handle these objections like an elite sales person and tailor you answers to the product you are selling and be concise, please format you answer as bullet points and address each objection separately, also try to avoid talking about other clients and rather focus on them and reframing their perspective, also try to keep your language friendly and easy to understand like you are talking to a friend.',
    // general_summary: 'Can you summarize the meeting? Please be concise.',
    // action_items: 'What are the action items from the meeting?',
    // decisions: 'What decisions were made in the meeting?',
    // next_steps: 'What are the next steps?',
    // key_takeaways: 'What are the key takeaways?',
};

/*
 * Gets a summary of the transcript using Anthropic's Claude model.
 */
router.post('/summarize', session, async (req, res, next) => {
    try {
        sanitize(req);
        validateAppContext(req);

        const botId = req.session.botId;
        const prompt = PROMPTS[req.body.prompt];
        const product = req.body.product;

        if (!botId) {
            return res.status(400).json({ error: 'Missing botId' });
        }

        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }

        const transcript = db.transcripts[botId] || [];

        console.log('transcript!!!!', transcript);
        const finalTranscript = transcript
            .map(
                (entry) =>
                    `Human: ${
                        entry.participant?.name || 'Unknown'
                    }: ${entry.words.map((w) => w.text).join(' ')}`
            )
            .join('\n');

        const completePrompt = PROMPTS._template
            .replace('{{transcript}}', finalTranscript)
            .replace('{{prompt}}', prompt)
            .replace('{{product}}', product);

        console.log('completePrompt', completePrompt);

        const data = await anthropicFetch('/v1/messages', {
            method: 'POST',
            body: JSON.stringify({
                model: 'claude-3-7-sonnet-20250219',
                max_tokens: 1024,
                messages: [{ role: 'user', content: completePrompt }],
            }),
        });

        console.log(data);

        return res.json({
            summary: data.content[0].text,
        });
    } catch (e) {
        next(handleError(e));
    }
});

export default router;
