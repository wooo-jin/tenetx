/**
 * Shared MCP stdio protocol handler (JSON-RPC 2.0)
 *
 * Usage:
 *   createMcpServer({ name, version, tools }).start();
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

interface McpServerConfig {
  name: string;
  version: string;
  tools: McpTool[];
}

export function createMcpServer(config: McpServerConfig): { start: () => void } {
  return {
    start() {
      let buffer = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          handleMessage(line.trim(), config);
        }
      });
      process.stdin.on('end', () => {
        if (buffer.trim()) handleMessage(buffer.trim(), config);
        process.exit(0);
      });
    },
  };
}

function handleMessage(raw: string, config: McpServerConfig): void {
  let msg: {
    jsonrpc: string;
    id?: number | string;
    method?: string;
    params?: Record<string, unknown>;
  };
  try {
    msg = JSON.parse(raw);
  } catch {
    sendError(null, -32700, 'Parse error');
    return;
  }

  const { id, method } = msg;

  // Notifications (no id) — just acknowledge silently
  if (id === undefined || id === null) return;

  switch (method) {
    case 'initialize':
      sendResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: config.name, version: config.version },
      });
      break;
    case 'tools/list':
      sendResult(id, {
        tools: config.tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
      break;
    case 'tools/call': {
      const params = msg.params ?? {};
      const toolName = params.name as string;
      const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
      const tool = config.tools.find(t => t.name === toolName);
      if (!tool) {
        sendError(id, -32601, `Tool not found: ${toolName}`);
        break;
      }
      tool
        .handler(toolArgs)
        .then(result => {
          sendResult(id, { content: [{ type: 'text', text: result }] });
        })
        .catch(err => {
          sendError(id, -32603, err instanceof Error ? err.message : String(err));
        });
      break;
    }
    default:
      sendError(id, -32601, `Method not found: ${method}`);
  }
}

function sendResult(id: number | string, result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(
  id: number | string | null,
  code: number,
  message: string,
): void {
  process.stdout.write(
    JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n',
  );
}
