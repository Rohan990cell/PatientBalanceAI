import React from "react";
import { DeviceConnectionStatus } from "../../types/hardware";

interface Props {
  status: DeviceConnectionStatus | "ready" | "pending" | "standby";
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<Props> = ({ status, label, className = "" }) => {
  let styleClass = "disconnected";
  let displayLabel = label || "Not Connected";

  switch (status) {
    case "connected":
    case "ready":
      styleClass = "connected";
      displayLabel = label || "Connected";
      break;
    case "scanning":
    case "pending":
      styleClass = "standby";
      displayLabel = label || "Searching...";
      break;
    case "standby":
      styleClass = "standby";
      displayLabel = label || "Standby";
      break;
    case "disconnected":
    default:
      styleClass = "disconnected";
      displayLabel = label || "Not Connected";
      break;
  }

  return (
    <span className={`status-pill ${styleClass} ${className}`}>
      <span className="dot-indicator" />
      <span>{displayLabel}</span>
    </span>
  );
};
