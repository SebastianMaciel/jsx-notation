const Dashboard = () => (
  <div className="flex flex-col min-h-screen bg-gray-50">
    <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
      <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
      <div className="flex items-center gap-3">
        <Button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          New Project
        </Button>
        <Avatar className="w-8 h-8 rounded-full" src={user.avatar} />
      </div>
    </header>
    <main className="flex-1 p-6">
      <div className="grid grid-cols-3 gap-6 mb-8">
        {stats.map(stat => (
          <div className="p-6 bg-white rounded-lg shadow-sm">
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
        </div>
        <ul className="divide-y divide-gray-200">
          {activities.map(item => (
            <li className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="text-sm text-gray-500">{item.time}</p>
                </div>
              </div>
              <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                {item.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  </div>
);
