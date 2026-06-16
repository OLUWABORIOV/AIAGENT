Architecture Tradeoffs

LLM Agent Service + React Dashboard · Oluwabori Odeyale

This document records every significant architectural and technology decision made while building the LLM Agent Service and its React dashboard. For each decision I explain what I chose, what I considered and rejected, why I made that call, and crucially what I gave up. Good engineering is not choosing the "best" tool in isolation; it is making deliberate tradeoffs and being able to defend them. This document is that defence.

Section 1 Core Architecture

1 Async job queue vs. synchronous request handling

Context: LLM agents calling Gemini can take 30–120 seconds to respond. I needed to decide whether to run the agent inside the HTTP request handler or hand it off to a background process.

Chosen: arq + Redis job queue (decoupled async pattern)

Alternatives considered: Run agent inside FastAPI handler · Background threading · Celery

Rationale: Running an LLM inside an HTTP handler fails in production for three reasons: HTTP connections time out (typically 30s), load balancers have their own timeouts, and one slow job blocks server capacity for all other users. The queue pattern returning a job_id in under 50ms and processing in the background is the standard solution to this problem. I chose arq over Celery because arq is async-native and requires zero broker configuration beyond the Redis instance I already needed. Celery's power comes with significant operational overhead that was not justified at this scale.

What I gave up: No real-time streaming of responses. The client must poll for the result. I accepted this because the polling UX is simple to build and polling every 3 seconds is negligible load. Streaming could be added later via WebSockets.

2 Redis for both job queue AND result storage

Context: I needed somewhere to store job state (QUEUED → RUNNING → COMPLETED) and the final result so any API replica could serve the GET /jobs/:id response.

Chosen: Redis for queue + results (single infrastructure component)

Alternatives considered: PostgreSQL for results · MongoDB · Separate message broker (RabbitMQ)

Rationale: Redis serves both roles cleanly: arq uses Redis lists as the queue, and I write results as Redis strings with a 1-hour TTL. One infrastructure component instead of two. Redis reads and writes happen in microseconds far faster than any disk-based database for this use case. The TTL feature means I never need to write a cleanup job. PostgreSQL would be the right choice if results needed to persist indefinitely for analytics, but a 1-hour window covers all practical polling scenarios.

What I gave up: Results are ephemeral they expire after 1 hour. If a client never polls, the result is gone. I documented this clearly in the API response. For a production product requiring persistent job history, I would add a PostgreSQL write alongside the Redis write.

3 Multiple worker processes vs. async tasks in the API process

Context: I needed to decide whether background work should run in the same process as the API (using asyncio tasks) or in completely separate worker processes.

Chosen: Separate arq worker processes (2 replicas)

Alternatives considered: asyncio.create_task() in the API process · Threading

Rationale: asyncio.create_task() inside the API process has a critical flaw: if the API server restarts (deploy, crash, OOM kill), all in-flight tasks are lost with no way to recover them. Separate worker processes backed by Redis persist jobs through any API restart the worker picks up where it left off. Separate processes also scale independently: I can run 10 workers and 2 API replicas without coupling their resource allocation.

What I gave up: More moving parts to start and monitor. Development requires starting both uvicorn and the arq worker. I mitigated this with a clear startup checklist and docker-compose handling both services.

Section 2 — LLM Agent Design

4 LangGraph state machine vs. direct LLM calls

Context: I needed to implement the ReAct (Reason-Act-Observe) agent loop. I could call the LLM directly in a Python while loop, or use a framework that formalises this as a graph.

Chosen: LangGraph with typed AgentState and conditional edges

Alternatives considered: Raw while loop · CrewAI · AutoGen

Rationale: A raw while loop works but produces fragile code the loop logic, state management, and exit conditions are tangled together and hard to test. LangGraph separates these concerns cleanly: nodes are pure functions (easy to unit test), edges are explicit routing logic (easy to reason about), and state is a typed dictionary (caught bugs at definition time). CrewAI was rejected because it abstracts too much when an agent misbehaves in production you need to see exactly what ran and why. LangGraph is fully transparent.

What I gave up: LangGraph adds a dependency and a learning curve. The graph abstraction is overkill for a single node agent. I accepted this because the project's purpose was learning production AI patterns LangGraph is the industry standard tool for this, and the mental model transfers directly to multi-agent systems.

5 Google Gemini API vs. other LLM providers

Context: The project needed an LLM provider for generating responses inside the LangGraph agent loop.

Chosen: Google Gemini API (1M token context, clean Python SDK)

Alternatives considered: Anthropic Claude API · OpenAI GPT-4 · Open-source models (Llama, Mistral)

Rationale: Gemini's key advantage is its 1 million token context window the largest available at project time, critical for long agentic conversations that accumulate context across many iterations. The google-generativeai SDK is well maintained and the pricing is competitive. OpenAI remains the most widely used and has excellent documentation, but Gemini's context window advantage was decisive for agent use cases. Self-hosted open-source models were rejected because they require GPU infrastructure significant operational overhead not justified for a project at this stage.

What I gave up: Gemini is a Google-controlled API with pricing subject to change. Vendor lock-in is a real risk. I mitigated this by isolating all LLM calls in agent.py swapping to a different provider requires changes in one file only.

6 Hard step limit (MAX_STEPS=10) vs. token budget control

Context: Agentic loops can run indefinitely if the LLM keeps requesting tool calls. I needed a mechanism to prevent runaway agents from burning tokens and money.

Chosen: MAX_STEPS=10 hard counter in AgentState

Alternatives considered: Token budget check before each call · Cost threshold check · Time limit

Rationale: A step counter is the simplest, most reliable loop guard. It requires no external computation just an integer in state that increments on every node visit. Token budget checks require counting tokens before each call (adds latency and complexity). Cost threshold checks require real-time pricing calculations. Time limits introduce concurrency complexity. The step counter gives a hard, deterministic bound that is trivially debuggable: if a run stops unexpectedly, checking step_count immediately shows whether it hit the limit.

What I gave up: MAX_STEPS=10 is a blunt instrument a complex task that legitimately needs 12 steps will be cut off. A production system would combine step limits with token budgets. I chose simplicity first and documented the limit clearly.

Section 3 API Layer

7 FastAPI vs. Flask or Django

Context: I needed a Python web framework to handle HTTP routes, request validation, authentication, and serve as the entry point for job submission.

Chosen: FastAPI with uvicorn ASGI server

Alternatives considered: Flask + gevent · Django REST Framework · aiohttp

Rationale: FastAPI's async-native design is the decisive factor. Flask with gevent can handle concurrency but it is a workaround fake async built on monkey-patching. FastAPI's async/await is real concurrency built on asyncio. The automatic request validation via Pydantic models eliminated an entire category of defensive code I would have written manually in Flask. The auto-generated /docs came for free. Django REST Framework was rejected as over-engineered it includes ORM, admin, sessions, and middleware systems that this project does not need.

What I gave up: FastAPI has a steeper initial learning curve than Flask understanding dependencies, lifespan, and ASGI requires more upfront knowledge. Flask's simplicity would have been appropriate for a prototype. I accepted the complexity because this project is explicitly about production patterns.

8 Middleware stack vs. per-route logic for cross-cutting concerns\*\*

Context: Auth, request ID injection, and access logging need to apply to every route. I had to decide where to put this code.

Chosen: Dedicated middleware classes (RequestIDMiddleware, AccessLogMiddleware)

Alternatives considered: Duplicate Depends() on every route· Decorators on every handler

Rationale: Middleware runs unconditionally on every request — you cannot accidentally forget it on a new route. Auth as a Depends() dependency would require adding it to every route definition; missing one means an unprotected endpoint in production. The exception is /health which must be public this is why auth is a dependency rather than middleware, giving selective application. Request ID and access logging have no exceptions and belong in middleware.

What I gave up: Middleware is harder to test in isolation than dependencies. Each middleware class requires understanding the ASGI call chain. I accepted this because the correctness guarantee — never forgetting auth on a route is worth more than the testability convenience.

Section 4 Frontend Design

9 React + Vite vs. plain HTML or server-rendered templates

Context: I needed a frontend for the agent dashboard job submission, real-time polling, and a data visualisation component.

Chosen: React 18 + Vite with Tailwind CSS

Alternatives considered:\*\* Plain HTML + vanilla JS · Jinja2 server templates · Next.js

Rationale: The 3-second polling requirement needs reactive state management React's useState and useEffect handle this naturally. Plain HTML with vanilla JS would require manual DOM manipulation for every state change fragile and verbose at scale. Jinja2 templates are server-rendered and require a full page reload or manual AJAX for real-time updates. Next.js adds SSR complexity that this client-only dashboard does not need. Vite was chosen over Create React App because it starts in milliseconds and its proxy feature solved CORS without configuration.

What I gave up: React adds ~130KB to the bundle and requires npm/Node.js in the development toolchain. For a dashboard used by developers, this is entirely acceptable. A non-technical user-facing product would need more careful bundle size consideration.

10 Three.js WebGL visualiser vs. a chart library

Context: The dashboard needed a visual component to represent the agent service in a memorable, differentiated way.

Chosen: Three.js + React Three Fiber with custom GLSL shaders

Alternatives considered: recharts line chart · Chart.js · D3.js · No visualisation

Rationale: This was a deliberate portfolio decision. Recharts or Chart.js would produce a standard line chart identical to every other dashboard. Three.js with instanced particle meshes and custom GLSL shaders demonstrates GPU programming, shader authoring, and React Three Fiber integration skills that are genuinely rare. The technical substance is real: ribbon shaders use additive blending and time-driven sin() animation running on the GPU at 60fps, and 120 particles are drawn in a single draw call using instancedMesh.

What I gave up: Three.js adds ~600KB to the bundle, loaded lazily via Suspense. The 3D scene shows no real data it is purely aesthetic. A production analytics dashboard would replace this with meaningful charts. For a portfolio project demonstrating technical range, the trade is correct.

11 Vite proxy vs. CORS configuration on the backend\*\*

Context: The React frontend on port 3000 needs to call the FastAPI backend on port 8000/8080. Browsers block cross-origin requests by default.

Chosen: Vite proxy in vite.config.js forwarding /v1 and /health to backend

Alternatives considered: CORS headers on FastAPI (CORSMiddleware) · Nginx reverse proxy · Same port

Rationale: The Vite proxy solves CORS in development with zero backend changes. CORSMiddleware on FastAPI (which I also included) is the production solution. Using both means the app works correctly in development (proxy) and production (CORS headers) without any environment-specific code.

What I gave up: The proxy only works in development. In production you need either the CORS headers (already present) or a real reverse proxy like nginx. I have the CORS middleware in place, so production deployment is covered.

Section 5 Testing & Observability

12 — Mock-based unit tests vs. integration tests with real infrastructure

Context: I needed tests for the API routes, agent logic, and schemas. Real Redis, real arq, or a real LLM were the alternatives.

Chosen: AsyncMock for Redis/arq, @patch for LLM client, httpx ASGITransport for HTTP

Alternatives considered: Real Redis in tests · LLM API calls in tests · Docker-based test environment

Rationale: Real infrastructure in tests introduces four problems: tests are slow, flaky, costly (LLM API charges per token), and require a running environment. AsyncMock gives complete control I can test the rate-limit path by making mock_redis.get() return "3" without needing three actual queued jobs. The 16 tests run in under 2 seconds with no infrastructure. ASGITransport sends real HTTP requests through the full FastAPI middleware stack mocking only happens at the Redis and LLM boundaries.

What I gave up: Mocks can lie. If my AsyncMock returns the wrong shape for a Redis response, the test passes but production fails. I mitigated this by keeping mock responses structurally identical to real Redis outputs and by running manual integration tests locally as a final verification step.

13 Langfuse + LangSmith for observability vs. custom logging only

Context: In production I need to understand what the agent is doing which prompts were sent, what was returned, how many tokens were used, and where time was spent.

Chosen: Langfuse (open-source, self-hostable) + LangSmith (LangGraph-native)

Alternatives considered: print() debugging · structlog traces only · Datadog APM

Rationale: Structlog gives structured JSON logs essential and already in place — but it does not understand LLM-specific concepts. Langfuse and LangSmith provide purpose-built UIs showing token counts per node, prompt inputs/outputs, agent step sequences, and cost per run. Langfuse was selected for data sovereignty (self-hostable, open-source). LangSmith for its zero-config LangGraph integration. Datadog would be appropriate for a team with existing infrastructure but is expensive for a solo project.

What I gave up: Both tools require accounts and API keys. I kept both as optional configuration via environment variables the app runs without them, observability activates when keys are set.

Closing Reflection

Every decision in this document was made under real constraints: I am a self-taught developer building production systems without a team, without a budget, and without the luxury of "we'll fix it later with more engineers." That forces a certain kind of discipline — choosing tools you understand deeply over tools that look impressive, and choosing simplicity you can debug at 2am over sophistication you cannot.

The through-line across all 13 decisions is the same principle: make the failure modes visible and recoverable. The job queue makes failures visible. The typed state machine makes agent failures debuggable. The middleware stack makes security failures impossible to accidentally omit. The mock-based tests make regressions detectable without infrastructure.

The things I gave up streaming responses, persistent job history, open-source models, server-side rendering are documented not as regrets but as acknowledged tradeoffs. I would make different tradeoffs with a larger team, a larger budget, or different user requirements. The ability to articulate exactly what you sacrificed and why is what separates deliberate architecture from accidental accumulation of technology.
