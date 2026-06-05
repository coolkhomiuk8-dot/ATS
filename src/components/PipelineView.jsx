import { useCallback, useMemo, useRef, useState } from "react";
import KCard from "./KCard";

export default function PipelineView({ stages, filteredDrivers, onSelectDriver, onDropDriverToStage }) {
  const [draggingDriverId, setDraggingDriverId] = useState(null);
  const [activeDropStageId, setActiveDropStageId] = useState(null);
  const [recentDropStageId, setRecentDropStageId] = useState(null);
  const boardRef = useRef(null);

  // Pre-bucket drivers by stage once per render instead of filtering N times.
  const cardsByStage = useMemo(() => {
    const out = {};
    for (const s of stages) out[s.id] = [];
    for (const d of filteredDrivers) {
      const bucket = out[d.stage];
      if (bucket) bucket.push(d);
    }
    return out;
  }, [stages, filteredDrivers]);

  // Stable callbacks — without these every KCard sees fresh prop identities
  // each render, defeating React.memo on the card component.
  const handleDragStart = useCallback((event, driverId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(driverId));
    setDraggingDriverId(driverId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingDriverId(null);
    setActiveDropStageId(null);
  }, []);

  // Cards call onClick(driverId) instead of a fresh closure per render.
  const handleCardClick = useCallback((driverId) => {
    onSelectDriver(driverId);
  }, [onSelectDriver]);

  function handleDrop(event, toStageId) {
    event.preventDefault();
    const fromData = event.dataTransfer.getData("text/plain");
    const parsedId = Number(fromData);
    const driverId = Number.isNaN(parsedId) ? draggingDriverId : parsedId;
    if (!driverId) return;

    onDropDriverToStage(driverId, toStageId);
    setDraggingDriverId(null);
    setActiveDropStageId(null);
    setRecentDropStageId(toStageId);
    window.setTimeout(() => setRecentDropStageId(null), 550);
  }

  return (
    <div
      ref={boardRef}
      className={`pipeline-board ${draggingDriverId ? "pipeline-board--dragging" : ""}`}
    >
      {stages.map((stage) => {
        const cards = cardsByStage[stage.id] || [];
        return (
          <div
            key={stage.id}
            className={`stage-column ${activeDropStageId === stage.id ? "stage-column--drop-active" : ""}`}
            data-stage-id={stage.id}
          >
            <div
              className={`stage-column__header ${recentDropStageId === stage.id ? "stage-column__header--drop-success" : ""}`}
            >
              <div className="stage-column__title-wrap">
                <div className="stage-column__dot" style={{ background: stage.color }} />
                <span className="stage-column__title">{stage.label}</span>
              </div>
              <span className="stage-column__count" style={{ background: stage.light, color: stage.color }}>
                {cards.length}
              </span>
            </div>

            <div
              className={`stage-cards ${draggingDriverId ? "stage-cards--drag-mode" : ""} ${activeDropStageId === stage.id ? "stage-cards--drop-active" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (activeDropStageId !== stage.id) setActiveDropStageId(stage.id);
              }}
              onDragEnter={() => setActiveDropStageId(stage.id)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setActiveDropStageId(null);
                }
              }}
              onDrop={(event) => handleDrop(event, stage.id)}
            >
              {cards.map((driver) => (
                <KCard
                  key={driver.id}
                  driver={driver}
                  onClick={handleCardClick}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isDragging={draggingDriverId === driver.id}
                />
              ))}
              {cards.length === 0 && (
                <div className="stage-cards__empty">
                  Empty
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
