// File: /utils/emails/templates/StatsEmailTemplate.js

import React from 'react';
import { Html, Head, Preview, Body, Container, Section, Heading, Text, Tailwind } from '@react-email/components';

const StatsEmailTemplate = ({ totalServers, totalSkipped, totalPosted, avgDuration, errors }) => {
    return (
        <Html>
            <Head />
            <Preview>Daily Scrapper Stats Summary</Preview>
            <Tailwind>
                <Body className="bg-gray-100">
                    <Container className="mx-auto p-4 bg-white rounded-lg shadow-lg">
                        <Heading className="text-2xl font-bold text-center mb-4">Daily Scrapper Stats Summary</Heading>
                        <Section>
                            <Text>Total Servers Parsed: {totalServers}</Text>
                            <Text>Total Servers Skipped: {totalSkipped}</Text>
                            <Text>Total Servers Posted: {totalPosted}</Text>
                            <Text>Average Duration: {avgDuration.toFixed(2)} seconds</Text>
                        </Section>
                        {errors.length > 0 && (
                            <Section>
                                <Heading className="text-xl font-bold">Errors:</Heading>
                                <ul>
                                    {errors.map((error, index) => (
                                        <li key={index}>{error}</li>
                                    ))}
                                </ul>
                            </Section>
                        )}
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
};

export default StatsEmailTemplate;
