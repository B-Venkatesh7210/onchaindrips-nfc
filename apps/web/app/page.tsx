import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-neutral-800">OnChainDrips</h1>
      <p className="text-neutral-500 text-sm">Sui + Next.js</p>
      <nav className="flex gap-4">
        <Link
          href="/me"
          className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700"
        >
          My Shirts
        </Link>
      </nav>
      <p className="text-neutral-400 text-xs">
        View a shirt at <code className="bg-neutral-200 px-1 rounded">/s/[objectId]</code>
      </p>
    </div>
  );
}
