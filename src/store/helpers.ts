import { Json } from "@bahatron/utils";
import { Knex } from "knex";
import { InsertOptions, STORE_VALUES } from "./static";
import { EventFilters } from "../client/interfaces";

export async function createTopic($postgres: Knex, topic: string) {
    try {
        await $postgres
            .table(STORE_VALUES.TOPIC_TABLE)
            .insert({ topic, seq: 0 });
    } catch (err: any) {
        if (
            err.message.includes("duplicate key value") ||
            err.code === "23505"
        ) {
            return;
        }

        throw err;
    }
}

export function knexEventFilter(
    builder: Knex.QueryBuilder,
    filters: EventFilters
): Knex.QueryBuilder {
    let { from, to, key, before, after } = filters;

    if (from) {
        builder.where("seq", ">=", from);
    }

    if (to) {
        builder.where("seq", "<", to);
    }

    if (key) {
        builder.where({ key });
    }

    if (before) {
        builder.where("timestamp", "<", before);
    }

    if (after) {
        builder.where("timestamp", ">=", after);
    }

    return builder;
}

export async function appendProcedure(
    $postgres: Knex,
    { topic, expectedSeq, timestamp, key, data }: InsertOptions
): Promise<number> {
    let result = await $postgres.raw(
        `call ${STORE_VALUES.APPEND_PROCEDURE}(?, ?, ?, ?, ?)`,
        [
            topic,
            expectedSeq ?? null,
            timestamp,
            key ?? null,
            Json.stringify(data) ?? null,
        ]
    );

    let seq = result.rows.shift().v_seq;

    return seq;
}
