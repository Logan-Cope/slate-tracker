type Props = { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; left?: React.ReactNode };

export function PageHeader({ title, subtitle, right, left }: Props) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex items-start gap-2 min-w-0">
        {left}
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-pretty break-words">{title}</h1>
          {subtitle ? <p className="text-sm text-muted mt-0.5">{subtitle}</p> : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
