/** @jsxImportSource react */
import { Body, Container, Head, Heading, Html, Text } from '@react-email/components';
import type { JSX } from 'react';
import type { MailTemplateProps } from '../../types.ts';

type Props = MailTemplateProps['_test-send'];

export function subject(_props: Props): string {
  return 'Seta mail transport test';
}

export default function TestSend(props: Props): JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={{ background: '#f6f7f9', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ maxWidth: 480, padding: 24, background: '#ffffff' }}>
          <Heading style={{ fontSize: 20, marginBottom: 12 }}>Mail transport test</Heading>
          <Text>
            This email confirms that {props.tenantName}'s Seta mail transport is configured
            correctly.
          </Text>
          <Text style={{ color: '#65676b', fontSize: 12 }}>Sent at {props.attemptedAt}.</Text>
        </Container>
      </Body>
    </Html>
  );
}
