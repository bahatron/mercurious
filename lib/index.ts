import axios from "axios";
import ws from "ws";
export interface MercuriosEventHandler<T = any> {
    (event: MercuriosEvent<T>): void;
}

export interface MercuriosEvent<T = any> {
    topic: string;
    seq: number;
    published_at: string;
    data: T;
}

export class MercuriosClient {
    private _wsc: ws | WebSocket | undefined;
    private _listeners: Record<string, MercuriosEventHandler[]> = {};
    private _queued: Function[] = [];

    public constructor(private readonly _url: string) {}

    private emit(topic: string, event: MercuriosEvent) {
        if (!this._listeners[topic]) {
            return;
        }

        this._listeners[topic].forEach(listener => listener(event));
    }

    private on(event: string, handler: MercuriosEventHandler) {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        } else if (this._listeners[event].includes(handler)) {
            return;
        }

        this._listeners[event].push(handler);
    }

    private off(event: string) {
        if (!this._listeners[event]) {
            return;
        }

        this._listeners[event] = [];
    }

    private wsc() {
        if (this._wsc) {
            return this._wsc;
        }

        this._wsc =
            typeof window === "undefined"
                ? new ws(this._url)
                : new WebSocket(this._url);

        this._wsc.onopen = async () => {
            let action: Function | undefined;

            while ((action = this._queued.shift())) {
                await action();
            }
        };

        this._wsc.onclose = () => {
            // this._wsc?.close();
            this._wsc = undefined;
        };

        this._wsc.onerror = (err: any) => {
            console.log(err);
        };

        this._wsc.onmessage = (msg: any) => {
            let event: MercuriosEvent = JSON.parse(
                (msg.data ?? msg).toString()
            );

            this.emit(event.topic, event);
        };

        return this._wsc;
    }

    async publish<T = any>(
        topic: string,
        data: any,
        expectedSeq?: number
    ): Promise<MercuriosEvent<T>> {
        try {
            const response = await axios.post(`${this._url}/stream/${topic}`, {
                data,
                expectedSeq,
            });

            return response.data;
        } catch (err) {
            throw err.response ? new Error(err.response.data) : err;
        }
    }

    async read<T = any>(
        topic: string,
        seq: number
    ): Promise<MercuriosEvent<T> | null> {
        try {
            const response = await axios.get(
                `${this._url}/stream/${topic}/${seq}`
            );
            return response.data;
        } catch (err) {
            if (err.response?.status === 204) {
                return null;
            }

            throw err.response ? new Error(err.response.data) : err;
        }
    }

    async subsribe<T = any>(
        topic: string,
        handler: MercuriosEventHandler<T>
    ): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                let socket = this.wsc();
                this.on(topic, handler);

                const action = () => {
                    socket.send(
                        JSON.stringify({
                            action: "subscribe",
                            topic,
                        })
                    );

                    resolve();
                };

                if (socket.readyState === socket.OPEN) {
                    action();
                } else {
                    this._queued.push(action);
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    async unsubscribe(topic: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                let socket = this.wsc();
                this.off(topic);

                const action = () => {
                    socket.send(
                        JSON.stringify({
                            action: "unsubscribe",
                            topic,
                        })
                    );

                    resolve();
                };

                if (socket.readyState === socket.OPEN) {
                    action();
                } else {
                    this._queued.push(action);
                }
            } catch (err) {
                reject(err);
            }
        });
    }
}

export default {
    connect({ url }: { url: string }): MercuriosClient {
        return new MercuriosClient(url);
    },
};
