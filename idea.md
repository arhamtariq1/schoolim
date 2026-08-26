I’m thinking of building a fairly large SaaS platform as my own product, mainly targeting schools.
The idea is to provide schools with a complete portal with different roles, such as Principal,
Admin, Reception, Teachers, and Students.

I’ve previously built a portal specifically for one school, but over time they made it extremely
complex. That’s why I now want to build my own product from scratch with a proper structure that can
work for multiple schools.

Would this actually be feasible as a SaaS platform? There would be multiple schools, and each school
would have completely separate data. For example, one school might have around 500 students, and
every month the system would need to generate fee vouchers for all students, manage attendance,
handle all the financial operations, and so on.

The previous portal I built for that specific school also became quite complicated. I had even
integrated QuickPay and the bank so that fee payments could be processed automatically.

I’m thinking of making this a SaaS product so I can charge schools a monthly subscription. What do
you think about this idea?

I’m also thinking of having two separate sides to the platform:

My own Super Admin Panel — only I would use this. From here, I could add and manage different
schools, view their information, manage subscriptions, monitor everything, and handle the overall
platform. School Portal — this would be provided to every school. Each school would have its own
isolated data and its own users, including Admins, Teachers, Students, Reception, Principal, etc.

So essentially, I want to build one core product that can be used by multiple schools instead of
building a separate system for every school.

I’m thinking of building a fairly large SaaS platform as my own product, mainly targeting schools.
The idea is to provide schools with a complete portal with different roles, such as Principal,
Admin, Reception, Teachers, and Students.

I’ve previously built a portal specifically for one school, but over time they made it extremely
complex. That’s why I now want to build my own product from scratch with a proper structure that can
work for multiple schools.

Would this actually be feasible as a SaaS platform? There would be multiple schools, and each school
would have completely separate data. For example, one school might have around 500 students, and
every month the system would need to generate fee vouchers for all students, manage attendance,
handle all the financial operations, and so on.

The previous portal I built for that specific school also became quite complicated. I had even
integrated QuickPay and the bank so that fee payments could be processed automatically.

I’m thinking of making this a SaaS product so I can charge schools a monthly subscription. What do
you think about this idea?

I’m also thinking of having two separate sides to the platform:

My own Super Admin Panel — only I would use this. From here, I could add and manage different
schools, view their information, manage subscriptions, monitor everything, and handle the overall
platform. School Portal — this would be provided to every school. Each school would have its own
isolated data and its own users, including Admins, Teachers, Students, Reception, Principal, etc.

Also I want To make a Turbo Repo for this, admin and portal is on nextjs, and backend is on nestjs.

So essentially, I want to build one core product that can be used by multiple schools instead of
building a separate system for every school. Initially, we don’t want to spend money on Railway, but
we still want everything to be live — the backend, database, and frontend.

We’re planning to build the backend with NestJS and connect Supabase directly to NestJS. Then we’ll
deploy both the backend and frontend on Vercel.

Later, once we get a client, we’ll migrate from Supabase to PostgreSQL and host both the backend and
database on Railway.
