import { useEffect, useRef } from 'react';
import * as AdaptiveCards from 'adaptivecards';

export default function AdaptiveCard({ card }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!card || !containerRef.current) return;

    // Clear previous content
    containerRef.current.innerHTML = '';

    const adaptiveCard = new AdaptiveCards.AdaptiveCard();

    // Set host config for Teams dark theme
    adaptiveCard.hostConfig = new AdaptiveCards.HostConfig({
      fontFamily: "Segoe UI, Helvetica Neue, sans-serif",
      containerStyles: {
        default: {
          backgroundColor: "#1e293b",
          foregroundColors: {
            default: {
              default: "#f1f5f9",
              subdued: "#94a3b8"
            },
            accent: {
              default: "#0ea5e9"
            },
            attention: {
              default: "#ef4444"
            },
            warning: {
              default: "#f59e0b"
            },
            good: {
              default: "#10b981"
            }
          }
        }
      }
    });

    // Handle submit actions
    adaptiveCard.onExecuteAction = (action) => {
      if (action instanceof AdaptiveCards.SubmitAction) {
        alert(`Action accepted: ${JSON.stringify(action.data)}`);
      } else if (action instanceof AdaptiveCards.OpenUrlAction) {
        window.open(action.url, '_blank');
      }
    };

    try {
      adaptiveCard.parse(card);
      const renderedCard = adaptiveCard.render();
      if (renderedCard) {
        containerRef.current.appendChild(renderedCard);
      }
    } catch (err) {
      console.error('Failed to render adaptive card', err);
    }
  }, [card]);

  return (
    <div className="mt-4 pt-4 border-t border-[#334155]">
      <p className="text-xs font-semibold text-[#cbd5e1] mb-2">Microsoft Teams Adaptive Card Payload:</p>
      <div ref={containerRef} className="adaptive-card-container rounded-lg overflow-hidden border border-[#334155] bg-[#0f172a] p-4 text-[#f1f5f9]" />
    </div>
  );
}
