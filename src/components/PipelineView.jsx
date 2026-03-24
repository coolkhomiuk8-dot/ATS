import { useState } from "react";
import KCard from "./KCard";

export default function PipelineView({ stages, filteredDrivers, onSelectDriver, onDropDriverToStage }) {
  const [draggingDriverId, setDraggingDriverId] = useState(null);
  const [activeDropStageId, setActiveDropStageId] = useState(null);
  const [recentDropStageId, setRecentDropStageId] = useState(null);

  function handleDragStart(event, driverId) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(driverId));
    setDraggingDriverId(driverId);
  }

  function handleDragEnd() {
    setDraggingDriverId(null);
    setActiveDropStageId(null);
  }

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
    <div className={`pipeline-board ${draggingDriverId ? "pipeline-board--dragging" : ""}`}>
      {stages.map((stage) => {
        const cards = filteredDrivers.filter((driver) => driver.stage === stage.id);
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
                  onClick={() => onSelectDriver(driver.id)}
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
