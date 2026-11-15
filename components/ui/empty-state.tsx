export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card mx-5 my-4 px-5 py-8 text-center">
      <div className="text-lg font-bold">{title}</div>
      {body ? <p className="text-muted mt-1 text-sm">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
