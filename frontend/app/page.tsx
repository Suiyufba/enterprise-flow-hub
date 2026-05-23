const metrics = [
  { label: "New leads", value: "128" },
  { label: "Overdue follow-ups", value: "17" },
  { label: "Signed this month", value: "42" },
  { label: "Failed syncs", value: "3" }
];

export default function Home() {
  return (
    <main style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
      <h1>Enterprise Flow Hub</h1>
      <p>Owner dashboard, workflow automation, connector logs, and customer follow-up visibility.</p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
        {metrics.map((metric) => (
          <article key={metric.label} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
            <strong style={{ display: "block", fontSize: 28 }}>{metric.value}</strong>
            <span>{metric.label}</span>
          </article>
        ))}
      </section>
    </main>
  );
}

