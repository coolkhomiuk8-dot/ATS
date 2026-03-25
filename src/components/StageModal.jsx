import { useState } from "react";
import { STAGES } from "../constants/data";
import { getTodayPlus } from "../utils/date";
import { FL } from "./UiBits";

export default function StageModal({ modal, onConfirm, onCancel }) {
  const [nextDate, setNextDate] = useState(getTodayPlus(1));
  const [nextTime, setNextTime] = useState("10:00");
  const [comment, setComment] = useState("");
  const [trainedBy, setTrainedBy] = useState(null);

  const from = STAGES.find((item) => item.id === modal.fromStage);
  const to = STAGES.find((item) => item.id === modal.toStage);
  const isDeadEnd = modal.toStage === "trash" || modal.toStage === "fired";
  const isHired = modal.toStage === "hired";

  const canConfirm = !isHired || trainedBy !== null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.5)",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        className="f-up"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 440,
          padding: 26,
          boxShadow: "0 20px 60px rgba(0,0,0,.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Stage change</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, background: from?.light, color: from?.color, borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}>
                {from?.label}
              </span>
              <span style={{ color: "#94a3b8", fontSize: 14 }}>to</span>
              <span style={{ fontSize: 12, background: to?.light, color: to?.color, borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}>
                {to?.label}
              </span>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 7,
              width: 30,
              height: 30,
              cursor: "pointer",
              color: "#64748b",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            x
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!isDeadEnd && (
            <div>
              <FL t="When is the next contact?" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>Date</div>
                  <input
                    type="date"
                    value={nextDate}
                    onChange={(event) => setNextDate(event.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 10px",
                      fontSize: 13,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      color: "#0f172a",
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>Time</div>
                  <input
                    type="time"
                    value={nextTime}
                    onChange={(event) => setNextTime(event.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 10px",
                      fontSize: 13,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      color: "#0f172a",
                      outline: "none",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Trained by (тільки при переміщенні в Hired) ── */}
          {isHired && (
            <div>
              <FL t="Trained by — required" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                {["Trained by Bogdan", "NOT Trained by Bogdan"].map((option) => (
                  <button
                    key={option}
                    onClick={() => setTrainedBy(option)}
                    style={{
                      padding: "10px 8px",
                      borderRadius: 9,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: `2px solid ${trainedBy === option ? "#2563eb" : "#e2e8f0"}`,
                      background: trainedBy === option ? "#eff6ff" : "#f8fafc",
                      color: trainedBy === option ? "#2563eb" : "#64748b",
                      transition: "all .15s",
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {trainedBy === null && (
                <div style={{ fontSize: 11, color: "#ef4444", marginTop: 5 }}>
                  ⚠ Please select one option to continue
                </div>
              )}
            </div>
          )}

          <div>
            <FL t="Comment (optional - saved to notes)" />
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="For example: Driver confirmed interest, waiting for CDL copy"
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 13,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                resize: "none",
                lineHeight: 1.6,
                color: "#0f172a",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                if (!canConfirm) return;
                onConfirm({
                  driverId: modal.driverId,
                  toStage: modal.toStage,
                  nextAction: nextDate,
                  nextActionTime: nextTime,
                  comment,
                  trainedBy: isHired ? trainedBy : undefined,
                });
              }}
              className="btn-p"
              style={{
                flex: 1,
                background: canConfirm ? "#2563eb" : "#94a3b8",
                border: "none",
                color: "#fff",
                padding: "11px",
                borderRadius: 9,
                fontSize: 14,
                fontWeight: 600,
                cursor: canConfirm ? "pointer" : "not-allowed",
                transition: "background .15s",
              }}
            >
              Confirm move
            </button>
            <button
              onClick={onCancel}
              className="btn-g"
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#374151",
                padding: "11px 18px",
                borderRadius: 9,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
