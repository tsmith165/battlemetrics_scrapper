const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const servers = await prisma.parsed_server.findMany();
    for (const server of servers) {
        console.log(`Updating server ${server.id} to region US`);
        await prisma.parsed_server.update({
            where: { id: server.id },
            data: { region: 'US' },
        });
    }
}

main();
