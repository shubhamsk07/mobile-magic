process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import express from 'express';
import { KubeConfig, CoreV1Api } from "@kubernetes/client-node";
import * as k8s from "@kubernetes/client-node";
import { getRandomName } from "./names";
import cors from 'cors';
import { addNewPod, addProjectToPod, redisClient, removePod } from './redis';
import { getAllPods } from './redis';
import { DOMAIN } from './config';

const kc = new KubeConfig();
const app = express();

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
                name, 
                image: '100xdevs/code-server-base:latest',
                ports: [{ containerPort: 8080 }, { containerPort: 8081 }],
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
}

async function assignPodToProject(projectId: string) {
    const pods = await getAllPods();
    const pod = Object.keys(pods).find((pod) => pods[pod] === "empty");
    if (!pod) {
        await createPod();
        return assignPodToProject(projectId);
    }
    addProjectToPod(projectId, pod);
    console.log(`Assigned project ${projectId} to pod ${pod}`);
    return pod;
}

app.get("/worker/:projectId", async (req, res) => {
    const { projectId } = req.params;
    const pod = await assignPodToProject(projectId);

    res.json({ workerUrl: `https://session-${pod}.${DOMAIN}`, previewUrl: `https://preview-${pod}.${DOMAIN}` });
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
