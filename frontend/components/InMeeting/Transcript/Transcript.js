import React, { useEffect, useRef } from 'react';
import './Transcript.css';

/* eslint react/prop-types: 0 */
export const Transcript = ({ transcript }) => {
    const ref = useRef();
    const finalTranscript = [];
    let currentSpeaker = null;

    if (Array.isArray(transcript)) {
        transcript.forEach((entry) => {
            const speaker = entry.participant?.name || 'Unknown';
            const words = entry.words?.map((word) => word.text).join(' ') || '';

            if (currentSpeaker !== speaker) {
                currentSpeaker = speaker;
                finalTranscript.push({ speaker, text: [] });
            }

            finalTranscript[finalTranscript.length - 1].text.push(words);
        });
    }

    useEffect(() => {
        if (ref.current) {
            ref.current.scrollTop = ref.current.scrollHeight;
        }
    }, [transcript]);

    return (
        <div ref={ref} className="InMeeting-transcript">
            {finalTranscript.map((item, index) => (
                <p key={index}>
                    <span className="InMeeting-transcript-speaker">
                        {item.speaker}:
                    </span>
                    <span> {item.text.join(' ')} </span>
                </p>
            ))}
        </div>
    );
};

export default Transcript;
