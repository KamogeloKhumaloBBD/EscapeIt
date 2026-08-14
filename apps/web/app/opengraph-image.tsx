import { ImageResponse } from "next/og";

export const alt = "Context Layer connecting coding agents to work context";
export const contentType = "image/png";
export const size = {
  height: 630,
  width: 1200,
};

const sourceCards = [
  { label: "Jira", left: 22, top: 86 },
  { label: "GitHub", left: 352, top: 60 },
  { label: "Confluence", left: 310, top: 344 },
  { label: "Teams", left: 4, top: 380 },
] as const;

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#fbfaf7",
        color: "#15130f",
        display: "flex",
        fontFamily: "Arial, sans-serif",
        height: "100%",
        overflow: "hidden",
        padding: "64px 68px",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          background:
            "radial-gradient(circle, rgba(90,65,232,0.18) 0%, rgba(90,65,232,0) 70%)",
          borderRadius: 999,
          display: "flex",
          height: 620,
          position: "absolute",
          right: -130,
          top: -180,
          width: 620,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 590,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          <svg
            height="38"
            style={{ marginRight: 14 }}
            viewBox="0 0 32 32"
            width="38"
          >
            <rect width="32" height="32" rx="8" fill="#17151b" />
            <path
              d="M8 8l5 5M24 8l-5 5M8 24l5-5M24 24l-5-5"
              fill="none"
              stroke="#806cf2"
              strokeLinecap="round"
              strokeWidth="2.5"
            />
            <g fill="#b5a9fa">
              <circle cx="7" cy="7" r="2.5" />
              <circle cx="25" cy="7" r="2.5" />
              <circle cx="7" cy="25" r="2.5" />
              <circle cx="25" cy="25" r="2.5" />
            </g>
            <rect
              x="11"
              y="11"
              width="10"
              height="10"
              rx="3"
              fill="#0b0a0d"
              stroke="#8a77f2"
            />
            <rect x="14" y="14" width="4" height="4" rx="1" fill="#8a77f2" />
          </svg>
          Context Layer
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "-0.065em",
            lineHeight: 0.98,
            marginTop: 64,
          }}
        >
          <span>Bring Context to</span>
          <span>Where The Work</span>
          <span>Happens</span>
        </div>

        <div
          style={{
            color: "#68635a",
            display: "flex",
            fontSize: 26,
            lineHeight: 1.35,
            marginTop: 30,
          }}
        >
          A universal context layer for coding agents.
        </div>

        <div
          style={{
            alignItems: "center",
            color: "#5a41e8",
            display: "flex",
            fontSize: 17,
            fontWeight: 700,
            marginTop: 44,
          }}
        >
          <div
            style={{
              background: "#5a41e8",
              borderRadius: 999,
              display: "flex",
              height: 8,
              marginRight: 12,
              width: 38,
            }}
          />
          Evidence connected
        </div>
      </div>

      <div
        style={{
          display: "flex",
          height: 500,
          marginLeft: 28,
          position: "relative",
          width: 480,
        }}
      >
        <svg
          height="500"
          style={{ left: 0, position: "absolute", top: 0 }}
          viewBox="0 0 480 500"
          width="480"
        >
          <circle
            cx="240"
            cy="250"
            fill="none"
            r="157"
            stroke="#e6e1fa"
            strokeDasharray="7 11"
            strokeWidth="2"
          />
          <g fill="none" stroke="#8a77f2" strokeWidth="3">
            <path d="M91 119 C148 130 146 211 184 231" />
            <path d="M393 91 C337 116 343 204 298 228" />
            <path d="M424 377 C348 361 348 296 297 275" />
            <path d="M73 412 C143 381 139 300 183 272" />
          </g>
          <g fill="#5a41e8">
            <circle cx="91" cy="119" r="5" />
            <circle cx="393" cy="91" r="5" />
            <circle cx="424" cy="377" r="5" />
            <circle cx="73" cy="412" r="5" />
          </g>
        </svg>

        {sourceCards.map(({ label, left, top }) => (
          <div
            key={label}
            style={{
              alignItems: "center",
              background: "#ffffff",
              border: "1px solid #eeeaf8",
              borderRadius: 14,
              boxShadow: "0 12px 30px rgba(30,25,50,0.10)",
              display: "flex",
              fontSize: 16,
              fontWeight: 700,
              left,
              padding: "13px 17px",
              position: "absolute",
              top,
            }}
          >
            <div
              style={{
                background: "#806cf2",
                borderRadius: 999,
                display: "flex",
                height: 9,
                marginRight: 10,
                width: 9,
              }}
            />
            {label}
          </div>
        ))}

        <div
          style={{
            background: "#17151b",
            borderRadius: 24,
            boxShadow: "0 28px 65px rgba(42,32,76,0.25)",
            color: "white",
            display: "flex",
            flexDirection: "column",
            height: 166,
            left: 152,
            padding: "25px 24px",
            position: "absolute",
            top: 166,
            width: 205,
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: 17,
              fontWeight: 700,
              justifyContent: "space-between",
            }}
          >
            Context Layer
            <div
              style={{
                background: "#8cffbd",
                borderRadius: 999,
                display: "flex",
                height: 8,
                width: 8,
              }}
            />
          </div>
          <div
            style={{
              color: "#938ca0",
              display: "flex",
              fontFamily: "monospace",
              fontSize: 12,
              letterSpacing: "0.08em",
              marginTop: 31,
            }}
          >
            GET_WORK_CONTEXT
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontWeight: 600,
              marginTop: 11,
            }}
          >
            Evidence connected.
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
