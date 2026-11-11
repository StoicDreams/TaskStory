<webui-data data-page-title="Help: Workflow" data-page-subtitle=""></webui-data>
<webui-data data-page-next-page='{"name": "Help: Dashboard", "href": "/help/dashboard"}'></webui-data>

## Recommended team workflow

Modern teams need tools and standards that help them organize software development, so they spend their time solving problems and delivering solutions in shorter cycles with better user experiences.

Task Story organizes that work by starting with the problems that need solving. Whoever declares a problem focuses on defining it well, without worrying about solutions yet.

## Ownership

Ownership drives iterative development with short release cycles.

Each part of the workflow (project, feature, problem, solution, and task) has exactly one owner at a time, and ownership can move between people as the work progresses. One owner doesn't mean only one person works on it. The owner takes the lead and makes the final decisions, weighing the team's discussion, facts, and opinions.

In Task Story the owner is the item's `person:` tag. Whoever saves a new item becomes its owner. To take over a problem or solution, remove the current owner's tag and save.

<webui-quote theme="success">

When someone declares a new problem, they are its first owner. They describe who is having the problem, what the problem is, where and when it happens, why it is a problem, and how to reproduce it.

When a developer is going to work on a problem, they take ownership of it. They investigate it, document possible solutions, prototype, test, and benchmark where needed, and then decide on and implement the best solution based on what they found.

</webui-quote>

## Define your project

Document the project's high-level details: who will benefit, what it is, where and when it is used, why people need it, and how they will discover and use it.

## Define features throughout a project's life

You may want to define a few key features when you start a project, depending on the project and how much thought has gone into it. Keep early feature descriptions short and general.

Add and update features throughout development: add a feature when a solution implements it for the first time, and update it when later solutions change it.

## Declare and define the problem

Problems can come from anywhere: managers, admins, customer feedback, logs, analytics, developers, and more.

Focus on understanding and defining the specific problem. When you can, describe it from the user's point of view, and never prescribe a solution.

<webui-quote theme="success" class="pa-2">Good: As a user, I need a way to purchase service X.</webui-quote>

<webui-quote theme="danger" class="pa-2">Bad: As a user, I need a product page where I can view details of and purchase service X.</webui-quote>

## Prioritize problems

The project owner prioritizes the problems in their project. Order the list by dragging, or with Alt+Arrow keys.

Treat priority as a guide, not a restraint on developers. There may be technical reasons the project owner doesn't know about, or a developer may see two problems as related and want to solve them together even though their priorities are far apart. A developer who changes the order should tell the project owner.

## A developer takes ownership of the problem

When a developer is ready to work on a problem, they take ownership of it.

## The developer engineers solutions

The developer researches and documents possible solutions to the problem. Where it makes sense, each solution is prototyped and measured, with documentation showing the results.

Based on what they measured, the developer decides on a final solution and implements it.

## Resolve problems by publishing their story

When every applicable solution to a problem has been implemented, close the problem by publishing it as a story.

A story brings together the problem, the solutions that were implemented to resolve it, and the solutions that were considered but dropped. Publishing deletes the problem and its solutions, and the story keeps the record.

## Learn more

- [Dashboard](/help/dashboard)
- [Projects](/help/projects), [Features](/help/features), [Problems](/help/problems), [Solutions](/help/solutions), [Tasks](/help/tasks), and [Stories](/help/stories)
- [Writing in Markdown](/help/markdown)
