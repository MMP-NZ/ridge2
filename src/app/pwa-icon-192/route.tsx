import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16703a",
          color: "white",
          fontSize: 110,
          fontWeight: 700,
        }}
      >
        J
      </div>
    ),
    { width: 192, height: 192 },
  );
}
