/**
 * Traffic and Telemetry Spike Generator
 */
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

async function simulate() {
  const service = process.argv[2] || "Checkout";
  const action = process.argv[3] || "spike"; // 'spike' or 'normalize'

  const endpoint = action === "normalize" ? "/api/metrics/normalize" : "/api/metrics/spike";

  console.log(`Sending ${action} command to service '${service}' at ${BACKEND_URL}${endpoint}...`);

  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service }),
  });

  const json = await res.json();
  console.log("Response:", json);
}

simulate().catch(console.error);
