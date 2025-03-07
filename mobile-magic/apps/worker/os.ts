import { prismaClient } from "db/client";

function getBaseWorkerDir(type: "NEXTJS" | "REACT_NATIVE") {
    if (type === "NEXTJS") {
        return "/tmp/next-app";
    }
    return "/tmp/mobile-app";
}

const ws = new WebSocket(process.env.WS_RELAYER_URL || "ws://ws-relayer:9093");

export async function onFileUpdate(filePath: string, fileContent: string, projectId: string, promptId: string, type: "NEXTJS" | "REACT_NATIVE") {
    await prismaClient.action.create({
        data: {
            projectId,
            promptId,
            content: `Updated file ${filePath}`
        },
    });

    ws.send(JSON.stringify({
        event: "admin",
        data: {
            type: "update-file",
            content: fileContent,
            path: `${getBaseWorkerDir(type)}/${filePath}`
        }
    }))
}

export async function onShellCommand(shellCommand: string, projectId: string, promptId: string) {
    //npm run build && npm run start
    const commands = shellCommand.split("&&");
    for (const command of commands) {
        console.log(`Running command: ${command}`);

        ws.send(JSON.stringify({
            event: "admin",
            data: {
                type: "command",
                content: command
            }
        }))

        await prismaClient.action.create({
            data: {
                projectId,
                promptId,
                content: `Ran command: ${command}`,
            },
        });
    }
}

export function onPromptStart(promptId: string) {
    ws.send(JSON.stringify({
        event: "admin",
        data: {
            type: "prompt-start"
        }
    }))

}

export function onPromptEnd(promptId: string) {
    ws.send(JSON.stringify({
        event: "admin",
        data: {
            type: "prompt-end"
        }
    }))
}