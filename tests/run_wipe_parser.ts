// /tests/run_wipe_parser.ts
import { PrismaClient } from '@prisma/client';
import moment from 'moment-timezone';

const prisma = new PrismaClient();

interface UpdateData {
    main_wipe_hour?: number;
    main_wipe_dow?: number;
    sec_wipe_hour?: number;
    sec_wipe_dow?: number;
    bp_wipe_hour?: number;
    bp_wipe_dow?: number;
}

interface Wipe_History {
    id: number;
    bm_id: number;
    timestamp: Date;
    wipe_time: string;
    is_bp: string;
    title: string | null;
    description: string | null;
    attributes: any | null;
}

async function updateServerWipeTimes(bm_id: number, wipe_times: string[]): Promise<void> {
    if (wipe_times.length === 0) return;

    const normal_wipe_dates_count: { [key: string]: number } = {};
    const bp_wipe_dates_count: { [key: string]: number } = {};

    for (const wipe_time of wipe_times) {
        const wipe_moment = moment.utc(wipe_time).tz('America/Los_Angeles');
        if (wipe_moment.date() <= 7 && wipe_moment.day() === 4 && wipe_moment.hour() > 6) {
            console.log(`Found BP wipe:`, wipe_moment.format('YYYY-MM-DD HH:mm:ss'));
            bp_wipe_dates_count[wipe_time] = (bp_wipe_dates_count[wipe_time] || 0) + 1;
        } else {
            console.log(`Found normal wipe:`, wipe_moment.format('YYYY-MM-DD HH:mm:ss'));
            normal_wipe_dates_count[wipe_time] = (normal_wipe_dates_count[wipe_time] || 0) + 1;
        }
    }

    const sorted_normal_wipes = Object.entries(normal_wipe_dates_count).sort((a, b) => b[1] - a[1]);
    const sorted_bp_wipes = Object.entries(bp_wipe_dates_count).sort((a, b) => b[1] - a[1]);

    console.log(`Sorted normal wipes:`, sorted_normal_wipes);
    console.log(`Sorted bp wipes:`, sorted_bp_wipes);

    const updateData: UpdateData = {};

    if (sorted_normal_wipes.length > 0) {
        const main_wipe_date = sorted_normal_wipes[0][0];
        if (main_wipe_date) {
            const main_moment = moment.utc(main_wipe_date).tz('America/Los_Angeles');
            updateData.main_wipe_hour = parseInt(main_moment.format('H'));
            updateData.main_wipe_dow = parseInt(main_moment.format('d'));
        }

        if (sorted_normal_wipes.length > 1) {
            const sec_wipe_date = sorted_normal_wipes[1][0];
            if (sec_wipe_date) {
                const sec_moment = moment.utc(sec_wipe_date).tz('America/Los_Angeles');
                updateData.sec_wipe_hour = parseInt(sec_moment.format('H'));
                updateData.sec_wipe_dow = parseInt(sec_moment.format('d'));
            }
        }
    }

    if (sorted_bp_wipes.length > 0) {
        const bp_wipe_date = sorted_bp_wipes[0][0];
        if (bp_wipe_date) {
            const bp_moment = moment.utc(bp_wipe_date).tz('America/Los_Angeles');
            updateData.bp_wipe_hour = parseInt(bp_moment.format('H'));
            updateData.bp_wipe_dow = parseInt(bp_moment.format('d'));
        }
    }

    console.log(`Updating server ${bm_id} with data:`, updateData);

    await prisma.parsed_server.update({
        where: { id: bm_id },
        data: updateData,
    });
}

async function main(): Promise<void> {
    // 1. Capture array of `id` values from the `parsed_server` table
    const serverIds = await prisma.parsed_server.findMany({ select: { id: true } });

    // 2. Loop through array of `id`'s - each `id` is a battle metrics server ID
    for (const { id } of serverIds) {
        console.log(`-------- Processing server ${id} --------`);

        // 3. For each `id`, query the `wipe_history` table for rows where the `bm_id` field matches the `id` field
        //    and capture only the `wipe_time` value. Create an array of wipe times for each `bm_id`
        const wipeTimes = await prisma.wipe_history.findMany({
            where: { bm_id: id },
            select: { wipe_time: true },
        });

        const wipeTimesArray = wipeTimes.map((wipeTime: Wipe_History) => wipeTime.wipe_time);
        console.log(`Wipe times:`, wipeTimesArray);

        // 4. Parse the wipe times for the `bm_id` to find the main_wipe_hour / main_wipe_dow,
        //    sec_wipe_hour / sec_wipe_dow, bp_wipe_hour / bp_wipe_dow
        // 5. Update the parsed_server table for row where the `id` field is same as the `bm_id` value
        //    (with new hour / dow values)
        await updateServerWipeTimes(id, wipeTimesArray);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
