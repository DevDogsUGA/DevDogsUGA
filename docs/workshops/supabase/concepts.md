---
name: "Supabase Concepts"
description: What Supabase is, database basics, how your app talks to it, and the auth and row-level security the tracks build on.
order: 1
---

# Supabase Concepts

The ideas behind the Supabase workshop, before either track writes any code. Adapted by Sloan Finger from Shruti Mishra's presentation at the Supabase workshop, Sep 28, 2026.

## What Is Supabase?

Supabase is an open-source backend platform built around PostgreSQL. It gives an app a database, authentication, file storage, realtime updates, and other backend services, without you running a server for any of them.

Each Supabase project has a dashboard. The parts you'll use most:

- **Table Editor:** create and manage tables
- **SQL Editor:** write and run SQL
- **Authentication:** manage users and how they sign in
- **Storage:** manage files

## PostgreSQL

At the core of every Supabase project is a full PostgreSQL database: a widely used, open-source relational database. It organizes data into tables, and supports SQL queries, foreign keys, and row-level security.

## Database 101

A **table** holds one kind of thing. Each **row** (or record) is one of them, and each **column** (or field) is one fact about it, with a type: `bigint` and `integer` for whole numbers, `text` for strings.

| id  | code     | name                 | credits |
| --- | -------- | -------------------- | ------- |
| 1   | CSCI1301 | Intro to Computing   | 4       |
| 2   | CSCI1302 | Software Development | 4       |
| 3   | CSCI2720 | Data Structures      | 4       |

The `id` column is the **primary key**: a value that's unique to each row, so every row can be found by it.

## Relationships

Tables point at each other. An enrollments table can record which course each student takes by storing the course's `id`:

| id  | student_name | course_id |
| --- | ------------ | --------- |
| 1   | Alex         | 3         |
| 2   | Maya         | 2         |
| 3   | Sam          | 3         |

`course_id` is a **foreign key**: each value is a primary key in the courses table. Alex and Sam both take Data Structures.

## Creating a Table With SQL

```sql
create table courses (
  id bigint primary key,
  code text,
  name text,
  credits integer
);
```

`create table` makes a new table named `courses`. Each line inside names a column and its type: `id` is a unique `bigint` per row, the code and name are `text`, and credits are a whole number. The workshop's first step creates its `messages` table the same way, in the dashboard's SQL Editor.

## Connecting Data to Users

Supabase keeps signed-in users in a built-in table, `auth.users`. Your own tables connect to it with a foreign key, like a `profiles` table whose `user_id` column holds an `auth.users` id. That's how a row knows who it belongs to.

## CRUD

The four basic operations on data, and the Supabase client method for each:

| Operation  | What it does         | Method     |
| ---------- | -------------------- | ---------- |
| **Create** | Add new data         | `insert()` |
| **Read**   | Retrieve or view it  | `select()` |
| **Update** | Change existing data | `update()` |
| **Delete** | Remove it            | `delete()` |

In a web app: users sign up (create), view profiles (read), change their settings (update), and deactivate their accounts (delete).

## How Your App Talks to Supabase

Your frontend never talks to the PostgreSQL database directly. It goes through the **Supabase client**, a library that connects your app to Supabase's services: data, authentication, storage, and the rest.

An **API key** tells Supabase which app is calling (a web page, a mobile app, a server). It doesn't say which user is signed in; that's authentication's job.

| Key             | Think of it as                                    | Where it lives                                 | What it can do                                                          |
| --------------- | ------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| **Publishable** | A key taped to the front door: it opens the lobby | The browser, the mobile app, any code you ship | Only what row-level security allows. Safe to expose.                    |
| **Secret**      | The master key in your pocket                     | Your backend, Edge Functions                   | Everything, bypassing row-level security. Never in a browser or in git. |

## Edge Functions

Edge Functions run backend code on Supabase's servers instead of in the user's browser. They keep sensitive information out of the frontend. For example: a user clicks "Send email", the app calls an Edge Function, the function uses secret credentials to send it, and the browser never sees them.

## Authentication

Authentication verifies who a user is. Supabase Auth handles sign-up, sign-in, and sessions, with email and password, magic links, OAuth providers, and more. The workshop signs users in with DevDogs, through OAuth.

**Authentication** identifies the user: Shruti signs in. **Authorization** controls what they can do: Shruti can only see her own data.

## Row-Level Security

Row-level security (RLS) controls which rows of a table each user can reach. It's the most important idea here: with the publishable key in every copy of your app, RLS is what keeps one user out of another's data.

**Policies** are the rules. Each says which rows a user may `select`, `insert`, `update` or `delete`, and PostgreSQL enforces them in the database itself:

```sql
create policy "Users can only see their own data"
on profiles
for select
using (auth.uid() = user_id);
```

This policy, named in quotes, applies to the `profiles` table when reading. `auth.uid()` is the signed-in user's id, so a row comes back only when its owner, `user_id`, is the current user.

## Storage and Realtime

**Storage** keeps files (images, videos, PDFs, documents) separately from your database, organized into buckets, with access controlled by RLS.

**Realtime** lets your app react when data changes: it can subscribe to a table's inserts, updates and deletes, and hear about them as they happen.

## Putting It All Together

1. A user uses your **frontend**.
2. The frontend calls the **Supabase client**.
3. **Auth** identifies the user.
4. **RLS policies** check what they can reach.
5. The **PostgreSQL database** stores the data, and sends back what they're allowed to see.

Storage holds the files and Realtime sends live updates, beside that flow. Ready to build it? Start the [Next.js track](./nextjs/setup) or the [Flutter track](./flutter/setup).
