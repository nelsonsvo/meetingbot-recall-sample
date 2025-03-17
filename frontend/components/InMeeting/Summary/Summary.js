import React, { useState } from 'react';
import './Summary.css';
import appFetch from '../../../helpers/fetch';

/* eslint react/prop-types: 0 */
export const Summary = ({ transcript, product }) => {
    const [summaryState, setSummaryState] = useState('none');
    const [prompt, setPrompt] = useState('objection_handle');
    const [summary, setSummary] = useState();

    const generateSummary = async () => {
        setSummaryState('summarising');

        const res = await appFetch('/api/summarize', {
            method: 'POST',
            body: JSON.stringify({
                prompt,
                product,
            }),
        });

        if (res.status < 299) {
            const data = await res.json();
            console.log('this is the data', data);
            setSummaryState('none');
            setSummary(data.summary);
        } else {
            setSummaryState('error');
        }
    };

    return (
        <div className="InMeeting-summary">
            <h3>AI Suggestions</h3>
            <p className="InMeeting-summary-text">{FormattedText(summary)}</p>
            <select value={prompt} onChange={(e) => setPrompt(e.target.value)}>
                <option value="objection_handle">Objection Handle</option>
                {/* <option value="general_summary">Summarize this meeting</option>
                <option value="action_items">Generate action items</option>
                <option value="decisions">Outline decisions made</option>
                <option value="next_steps">Highlight next steps</option>
                <option value="key_takeaways">Find key takeaways</option> */}
            </select>
            <button
                onClick={generateSummary}
                disabled={
                    transcript.length === 0 ||
                    ['summarising', 'error'].includes(summaryState)
                }
            >
                {summaryState === 'none' && 'Get Suggestions'}
                {summaryState === 'summarising' && 'Thinking...'}
                {summaryState === 'error' && 'An Error Occurred'}
            </button>
        </div>
    );
};
const FormattedText = (text) => {
    if (!text) return null;

    // Regular expression to match words wrapped in '**'
    const formattedText = text.split('**').map((part, index) => {
        // If the part is at an odd index, it should be bold
        if (index % 2 !== 0) {
            return <strong key={index}>{part}</strong>;
        }
        return part;
    });

    return <div>{formattedText}</div>;
};
export default Summary;
