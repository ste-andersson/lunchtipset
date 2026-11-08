# ElevenLabs agents

Nothing needs to be set up in the ElevenLabs dashboard. With `ELEVENLABS_API_KEY`
set, the API creates and updates everything when it starts
([api/src/voice/syncAgents.ts](../api/src/voice/syncAgents.ts)):

- **Client tools** from [toolDefinitions.ts](../api/src/voice/toolDefinitions.ts),
  matched by name. Their handlers run in the browser
  ([web/src/call/tools.ts](../web/src/call/tools.ts)); names and parameters must match.
- **One agent per assistant** in [assistants.ts](../api/src/data/assistants.ts),
  named "Lunchlinjen – <name>" and tagged `lunchlinjen:<id>`, with:
  - the tools plus the built-in _end call_ tool,
  - authentication on, so it can only be reached through signed URLs from the API,
  - overrides allowed for prompt, first message, language and voice,
  - optional `agent.llm` / `agent.ttsModelId` from the assistant definition.

Each agent carries a config hash tag, so a restart only patches agents whose
assistant or tool definitions changed (every patch is a new agent version in
ElevenLabs).

When a call starts, the web app overrides the agent's prompt with the
assistant's personality plus today's menus, the user's preferences, history and
ranking ([web/src/call/prompt.ts](../web/src/call/prompt.ts)).

## Commands

```sh
npm --prefix api run sync-agents   # sync now and print assistant → agent id
```

## Notes

- The API key needs read/write access to Agents (Conversational AI).
- Removing an assistant from `assistants.ts` leaves its agent in ElevenLabs;
  delete it there if you want it gone.
- Tools are shared across your ElevenLabs account and matched by name, so avoid
  other client tools named e.g. `log_meal` in the same account.
