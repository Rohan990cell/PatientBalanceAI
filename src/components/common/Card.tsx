import React from "react";

interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  variant?: "white" | "mint";
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  icon,
  headerAction,
  children,
  className = "",
  variant = "white",
}) => {
  const cardClass = variant === "mint" ? "medical-card-mint" : "medical-card";

  return (
    <div
      className={`${cardClass} ${className}`}
      style={{ padding: "24px" }}
    >
      {(title || headerAction) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "18px",
            borderBottom: "1px solid var(--border-light)",
            paddingBottom: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {icon && (
              <div
                style={{
                  color: "var(--teal-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {icon}
              </div>
            )}
            <div>
              {title && (
                <h3
                  style={{
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    color: "var(--text-main)",
                  }}
                >
                  {title}
                </h3>
              )}
              {subtitle && (
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                    marginTop: "2px",
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
};
