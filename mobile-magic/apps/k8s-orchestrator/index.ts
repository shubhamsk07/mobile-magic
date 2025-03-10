process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import express from 'express';
import { KubeConfig, CoreV1Api } from "@kubernetes/client-node";
import * as k8s from "@kubernetes/client-node";
import { getRandomName } from "./names";
import cors from 'cors';
import { Writable } from 'stream';
import { addNewPod, addProjectToPod, redisClient, removePod } from './redis';
import { getAllPods } from './redis';
import { DOMAIN } from './config';
import { prismaClient } from "db/client";

const kc = new KubeConfig();
const app = express();

const PROJECT_TYPE_TO_BASE_FOLDER = {
    NEXTJS: "/tmp/next-app",
    REACT: "/tmp/react-app",
    REACT_NATIVE: "/tmp/mobile-app"
}

const POD_EXPIRY = 1000 * 60 * 5; // 5 minutes
const EMPTY_POD_BUFFER_SIZE = 3;
kc.loadFromDefault();

app.use(cors());

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const currentContext = kc.getCurrentContext();
const cluster = kc.getCluster(currentContext);

async function listPods(): Promise<string[]> {
    const res = await k8sApi.listNamespacedPod({ namespace: 'user-apps' });
    console.log(res.items.map((pod) => pod.status?.phase));
    return res.items.filter(pod => pod.status?.phase === 'Running' || pod.status?.phase === 'Pending').filter(pod => pod.metadata?.name).map((pod) => pod.metadata?.name as string);
}

async function createPod() {
    const name = getRandomName();

    await k8sApi.createNamespacedPod({ namespace: 'user-apps', body: {
        metadata: {
            name: name,
            labels: {
                app: name,
            },
        },
        spec: {
            containers: [{
                name: "code-server",
                image: '100xdevs/code-server-base:v2',
                ports: [{ containerPort: 8080 }, { containerPort: 8081 }],
            }, {
                name: "ws-relayer",
                image: "100xdevs/ws-relayer:latest",
                ports: [{ containerPort: 9093 }],
            }, {
                name: "worker",
                image: "100xdevs/worker:latest",
                ports: [{ containerPort: 9091 }],
                env: [{
                    name: "WS_RELAYER_URL",
                    value: `ws://localhost:9091`,
                }, {
                    name: "ANTHROPIC_API_KEY",
                    valueFrom: {
                        secretKeyRef: {
                            name: "worker-secret",
                            key: "ANTHROPIC_API_KEY",
                        }
                    }
                }]
            }],
        },
    }});

    await k8sApi.createNamespacedService({ namespace: 'user-apps', body: {
        metadata: {
            name: `session-${name}`,
        },
        spec: {
            selector: {
                app: name,
            },
            ports: [{ port: 8080, targetPort: 8080, protocol: 'TCP', name: 'session' }],
        },
    }});

    await k8sApi.createNamespacedService({ namespace: 'user-apps', body: {
        metadata: {
            name: `preview-${name}`,
        },
        spec: {
            selector: {
                app: name,
            },
            ports: [{ port: 8080, targetPort: 8081, protocol: 'TCP', name: 'preview' }],
        },
    }});

    await k8sApi.createNamespacedService({ namespace: 'user-apps', body: {
        metadata: {
            name: `worker-${name}`,
        },
        spec: {
            selector: {
                app: name,
            },
            ports: [{ port: 8080, targetPort: 9091, protocol: 'TCP', name: 'preview' }],
        },
    }});
}

async function assignPodToProject(projectId: string, projectType: "NEXTJS" | "REACT_NATIVE" | "REACT") {
    const pods = await getAllPods();
    const pod = Object.keys(pods).find((pod) =>  pods[pod] === "empty");
    if (!pod) {
        await createPod();
        return assignPodToProject(projectId, projectType);
    }

    const exec = new k8s.Exec(kc);
    let stdout = "";
    let stderr = "";
    console.log(`mv ${PROJECT_TYPE_TO_BASE_FOLDER[projectType]}/* /app`);
    exec.exec("user-apps", pod, "code-server", ["/bin/sh", "-c", `mv ${PROJECT_TYPE_TO_BASE_FOLDER[projectType]}/* /app`], 
        new Writable({
            write: (chunk: Buffer, encoding: BufferEncoding, callback: () => void) => {
                stdout += chunk;
                callback();
            }
        }), 
        new Writable({
            write: (chunk: Buffer, encoding: BufferEncoding, callback: () => void) => {
                stderr += chunk;
                callback();
            }
        }), 
        null,
        false, 
        (status) => {
            console.log(status);
            console.log(stdout);
            console.log(stderr);
        }
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(stdout);
    console.log(stderr);

    addProjectToPod(projectId, pod);
    console.log(`Assigned project ${projectId} to pod ${pod}`);
    return pod;
}

app.get("/worker/:projectId", async (req, res) => {
    const { projectId } = req.params;
    const project = await prismaClient.project.findUnique({
        where: {
            id: projectId,
        },
    });

    if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
    }

    const pod = await assignPodToProject(projectId, "REACT"); // project.type);

    res.json({ 
        sessionUrl: `https://session-${pod}.${DOMAIN}`, 
        previewUrl: `https://preview-${pod}.${DOMAIN}`, 
        workerUrl: `https://worker-${pod}.${DOMAIN}` 
    });
});

app.listen(7001, () => {
    console.log("Server is running on port 7001");
});

async function updateFromK8s() {
    const pods = await getAllPods();
    const k8sPods = await listPods();
    const k8sPodsSet = new Set(k8sPods);
    const redisPodsSet = new Set(Object.keys(pods));
    const podsToRemove = Array.from(redisPodsSet).filter((pod) => !k8sPodsSet.has(pod));
    for (const pod of podsToRemove) {
        await removePod(pod);
    }

    const podsToAdd = Array.from(k8sPodsSet).filter((pod) => !redisPodsSet.has(pod));
    for (const pod of podsToAdd) {
        await addNewPod(pod);
    }

    const podsInRedis = await getAllPods();
    const emptyPods = Object.keys(podsInRedis).filter((pod) => podsInRedis[pod] === "empty");

    if (emptyPods.length < EMPTY_POD_BUFFER_SIZE) {
        console.log(`Creating ${EMPTY_POD_BUFFER_SIZE - emptyPods.length} pods`);
        for (let i = 0; i < EMPTY_POD_BUFFER_SIZE - emptyPods.length; i++) {
            await createPod();
        }
    }
}

// when it starts
redisClient.on("connect", () => {
    console.log("Redis connected");
    setInterval(async () => {
        updateFromK8s()
    }, 1000 * 30);

    updateFromK8s()
});
