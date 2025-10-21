//src/pages/index.tsx
export default function Home() {
    return (
        <main className="p-6 space-y-4">
            <h1 className="text-2xl font-bold">Tailwind Color Test</h1>

            <div className="grid grid-cols-2 gap-3 max-w-md">
                <div className="h-12 rounded bg-blue-500"></div>
                <div className="h-12 rounded bg-red-500"></div>
                <div className="h-12 rounded bg-emerald-500"></div>
                <div className="h-12 rounded bg-purple-500"></div>
            </div>

            <p className="text-gray-600">
                4つの色ブロックが表示されれば Tailwind v4 が効いています。
            </p>
        </main>
    );
}