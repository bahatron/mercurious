import $axios from "axios";
import $streams from "../../domain/modules/stream_repository";
import { streamTable } from "../../domain/modules/stream_repository";
import $nats from "../../services/nats";
import $mysql from "../../services/mysql";
import $assertions from "../../services/assertions";
import $logger from "../../services/logger";
import $createStream from "../../domain/create_stream";
import $json from "../../services/json";
import $config from "../../services/config";

const MERCURIOS_TEST_URL = $config.test_url;

export async function _publishEvent(
    topic: string,
    data: any,
    expectedSeq?: number
) {
    return $axios.post(`${MERCURIOS_TEST_URL}/stream/${topic}`, {
        data,
        expectedSeq,
    });
}

describe("Feature: publish event", () => {
    describe(`Scenario: stringified request payload`, () => {
        const _stream = "publish_double_stringified_test";

        const _schema = {
            type: "object",
            properties: {
                foo: { type: "string" },
                required: ["foo"],
            },
        };

        before(async () => {
            await $createStream(_stream, _schema);
        });

        it("level 1", async () => {
            await _publishEvent(_stream, {
                data: $json.stringify({ foo: "sanchez" }),
            });
        });

        it("level 2", async () => {
            await _publishEvent(_stream, {
                data: JSON.stringify($json.stringify({ foo: "sanchez" })),
            });
        });

        it("level 3", async () => {
            await _publishEvent(
                _stream,
                $json.stringify({
                    data: JSON.stringify($json.stringify({ foo: "sanchez" })),
                })
            );
        });
    });

    describe("Scenario: publish to a stream without schema", () => {
        const TOPIC = `publish_event_test`;

        before(async () => {
            await $createStream(TOPIC);
        });

        it("creates a record on the stream table", async () => {
            let payload = {
                foo: "bar",
            };

            let event = await _publishEvent(TOPIC, payload);

            let result = await $mysql(streamTable(TOPIC))
                .where({
                    seq: event.data.seq,
                })
                .first();

            $assertions.expect(result).not.to.be.undefined;
        });

        it("emits an event related to the topic", async () => {
            return new Promise(async resolve => {
                let event: any;

                $nats.subscribe(`stream.${TOPIC}`, (err, msg) => {
                    resolve(
                        $assertions.expect(msg.data).to.deep.eq(event.data)
                    );
                });

                event = await _publishEvent(TOPIC, "hello from test");
            });
        });
    });

    describe("Scenario: with valid schema", () => {
        const topic = `test_with_schmea`;
        const schema = {
            type: "object",
            properties: {
                test: { type: "number" },
            },
        };

        before(async () => {
            await $createStream(topic, schema);
        });

        it("publishes an event if complies with the schema", async () => {
            let response = await _publishEvent(topic, { test: 5 });

            $assertions.expect(response.status).to.eq(201);
        });

        it("rejects the request if the payload does not comply with the schema", async () => {
            return new Promise(async resolve => {
                try {
                    await _publishEvent(topic, "invalid message");
                } catch (err) {
                    resolve($assertions.expect(err.response.status).to.eq(400));
                }
            });
        });
    });

    describe(`Scenario: using expected seq`, () => {
        let TOPIC = `publish_with_expected_seq_test`;

        before(async () => {
            try {
                await $streams.delete(TOPIC);

                await $createStream(TOPIC);

                await Promise.all(
                    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(val => {
                        return _publishEvent(TOPIC, val);
                    })
                );
            } catch (err) {
                $logger.warning("error loading fixtures");
                $logger.error(err);
                throw err;
            }
        });

        it("responds with http status code 417 if seq number is already taken", async () => {
            return new Promise(async resolve => {
                try {
                    await _publishEvent(TOPIC, "another message", 5);
                } catch (err) {
                    resolve($assertions.expect(err.response.status).to.eq(417));
                }
            });
        });

        it("responds with http status code 417 if expected sequence number is higher than actual", async () => {
            return new Promise(async resolve => {
                try {
                    await _publishEvent(TOPIC, "another message", 15);
                } catch (err) {
                    resolve($assertions.expect(err.response.status).to.eq(417));
                }
            });
        });

        it("publishes the event if 'next' sequence number matches the expected", async () => {
            let response = await _publishEvent(TOPIC, "12 from test", 12);

            $assertions.expect(response.data.seq).to.eq(12);
        });
    });
});
