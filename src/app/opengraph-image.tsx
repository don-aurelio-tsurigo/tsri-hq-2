import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Tsüri Hub";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  const logoData = await readFile(
    join(process.cwd(), "public/brand/tsuri-logo.png"),
  );
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #7ec8f5 0%, #4eb4ef 42%, #2b9fe0 100%)",
        }}
      >
        <img
          src={logoSrc}
          width={780}
          height={439}
          alt=""
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { ...size },
  );
}
