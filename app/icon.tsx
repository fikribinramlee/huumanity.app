import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "white",
          borderRadius: 8,
          border: "1.5px solid rgba(0,0,0,0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Logo: yellow square behind "h", "uu" on white */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            fontFamily: "Georgia, serif",
            fontSize: 17,
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: "-0.5px",
          }}
        >
          <span
            style={{
              background: "#fff700",
              display: "flex",
              alignItems: "flex-end",
              width: 14,
              height: 14,
              paddingLeft: 1,
              paddingBottom: 1,
              lineHeight: 1,
            }}
          >
            h
          </span>
          <span style={{ lineHeight: 1 }}>uu</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
