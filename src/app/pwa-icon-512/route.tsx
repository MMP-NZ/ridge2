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
          background: "#1f7a3f",
          color: "white",
          fontSize: 290,
          fontWeight: 700,
        }}
      >
        J
      </div>
    ),
    { width: 512, height: 512 },
  );
}
