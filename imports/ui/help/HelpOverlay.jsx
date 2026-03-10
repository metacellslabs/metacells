import { useEffect, useMemo, useState } from "react";
import { HELP_SECTIONS } from "./helpContent.js";

function renderHelpItem(text) {
  const lines = String(text || "").split("\n");
  return lines.map((line, lineIndex) => {
    const parts = line.split(/(`[^`]+`)/g).filter(Boolean);
    return (
      <span key={`${line}-${lineIndex}`} className="help-line">
        {parts.map((part, index) => {
          if (part.charAt(0) === "`" && part.charAt(part.length - 1) === "`") {
            return <strong key={`${part}-${index}`}>{part.slice(1, -1)}</strong>;
          }
          return <span key={`${part}-${index}`}>{part}</span>;
        })}
      </span>
    );
  });
}

function parseExampleItem(text) {
  const lines = String(text || "").split("\n");
  let title = "";
  let formula = "";
  let value = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || "");
    if (line.indexOf("Title:") === 0) {
      title = line.substring("Title:".length).trim();
      continue;
    }
    if (line.indexOf("Formula:") === 0) {
      formula = line.substring("Formula:".length).trim();
      continue;
    }
    if (line.indexOf("Value:") === 0) {
      value = line.substring("Value:".length).trim();
    }
  }

  return { title, formula, value };
}

function renderExampleItem(text) {
  const parsed = parseExampleItem(text);
  return (
    <div className="help-example-cell">
      {parsed.title ? <div className="help-example-title">{parsed.title}</div> : null}
      <div className="help-example-row help-example-formula">
        <span className="help-example-label">Formula</span>
        <div className="help-example-value">{renderHelpItem(parsed.formula)}</div>
      </div>
      <div className="help-example-row help-example-result">
        <span className="help-example-label">Value</span>
        <div className="help-example-value">{renderHelpItem(parsed.value)}</div>
      </div>
    </div>
  );
}

export function HelpOverlay({ isOpen, onClose }) {
  const [query, setQuery] = useState("");
  const [activeSectionTitle, setActiveSectionTitle] = useState("");

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setActiveSectionTitle("");
    }
  }, [isOpen]);

  const filteredSections = useMemo(() => {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return HELP_SECTIONS;

    return HELP_SECTIONS.map((section) => {
      const titleMatches = section.title.toLowerCase().includes(normalizedQuery);
      const items = titleMatches
        ? section.items
        : section.items.filter((item) => String(item).toLowerCase().includes(normalizedQuery));
      return { ...section, items };
    }).filter((section) => section.items.length > 0);
  }, [query]);

  useEffect(() => {
    if (!filteredSections.length) {
      setActiveSectionTitle("");
      return;
    }

    const hasActive = filteredSections.some((section) => section.title === activeSectionTitle);
    if (!hasActive) {
      setActiveSectionTitle(filteredSections[0].title);
    }
  }, [filteredSections, activeSectionTitle]);

  const activeSection = filteredSections.find((section) => section.title === activeSectionTitle) || null;

  if (!isOpen) return null;

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(event) => event.stopPropagation()}>
        <div className="help-modal-head">
          <div>
            <h2>Help</h2>
            <p>Commands, shortcuts, examples, and report patterns.</p>
          </div>
          <button type="button" className="help-close" onClick={onClose} aria-label="Close help">×</button>
        </div>
        <div className="help-search-row">
          <input
            className="help-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search formulas, mentions, reports, files..."
          />
        </div>
        <div className="help-layout">
          {filteredSections.length ? (
            <>
              <aside className="help-sidebar" aria-label="Help sections">
                <div className="help-tabs">
                  {filteredSections.map((section) => (
                    <button
                      key={section.title}
                      type="button"
                      className={`help-tab${section.title === activeSectionTitle ? " active" : ""}`}
                      onClick={() => setActiveSectionTitle(section.title)}
                    >
                      {section.title}
                    </button>
                  ))}
                </div>
              </aside>
              {activeSection ? (
                <section
                  className={`help-card help-panel help-card-${activeSection.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <h3>{activeSection.title}</h3>
                  <ul>
                    {activeSection.items.map((item) => (
                      <li key={item}>
                        {activeSection.title === "Examples" ? renderExampleItem(item) : renderHelpItem(item)}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <section className="help-card help-card-empty help-panel">
              <h3>No matches</h3>
              <p>Try a broader search like <strong>file</strong>, <strong>report</strong>, <strong>update</strong>, or <strong>@idea</strong>.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
