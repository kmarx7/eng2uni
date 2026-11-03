// Local-only review screens (stage 8). Production builds answer 404 for every page here.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-caption text-muted-foreground">콘텐츠 검수 · 로컬 전용</p>
      {children}
    </div>
  );
}
