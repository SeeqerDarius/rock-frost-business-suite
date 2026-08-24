import Image from "next/image";

export function PersonAvatar({ id, fullName, photoData, size = 56 }: { id: string; fullName: string; photoData: string | null; size?: number }) {
  if (photoData) {
    return <Image src={`/api/hr/employees/${id}/photo`} alt={fullName} width={size} height={size} unoptimized className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary" style={{ width: size, height: size }}>
      {fullName.slice(0, 1).toUpperCase()}
    </span>
  );
}
