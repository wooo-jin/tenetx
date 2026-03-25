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
      // 메시지 큐: 한 번에 하나의 메시지만 처리하여 tools/call 동시 실행 방지
      const queue: string[] = [];
      let processing = false;
      let stdinEnded = false;

      async function processQueue(): Promise<void> {
        if (processing) return;
        processing = true;
        while (queue.length > 0) {
          const line = queue.shift() ?? '';
          await handleMessage(line, config);
        }
        processing = false;
        // stdin이 이미 종료되었고 큐도 비었으면 프로세스 종료
        if (stdinEnded) process.exit(0);
      }

      function enqueue(line: string): void {
        queue.push(line);
        processQueue().catch(err => {
          sendError(null, -32603, err instanceof Error ? err.message : String(err));
        });
      }

      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          enqueue(line.trim());
        }
      });
      process.stdin.on('end', () => {
        stdinEnded = true;
        if (buffer.trim()) enqueue(buffer.trim());
        // 큐가 비어있고 처리 중이 아니면 즉시 종료
        if (!processing && queue.length === 0) process.exit(0);
      });
    },
  };
}

async function handleMessage(raw: string, config: McpServerConfig): Promise<void> {
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
      if (typeof params.name !== 'string' || params.name.length === 0) {
        sendError(id, -32602, 'Invalid params: name must be a non-empty string');
        break;
      }
      const toolName = params.name;
      const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
      const tool = config.tools.find(t => t.name === toolName);
      if (!tool) {
        sendError(id, -32601, `Tool not found: ${toolName}`);
        break;
      }
      try {
        const result = await tool.handler(toolArgs);
        sendResult(id, { content: [{ type: 'text', text: result }] });
      } catch (err) {
        sendError(id, -32603, err instanceof Error ? err.message : String(err));
      }
      break;
    }
    default:
      sendError(id, -32601, `Method not found: ${method}`);
  }
}

function sendResult(id: number | string, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function sendError(
  id: number | string | null,
  code: number,
  message: string,
): void {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`,
  );
}
