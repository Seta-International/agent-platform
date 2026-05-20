/** @jsxImportSource react */
import { Body, Button, Container, Head, Heading, Html, Text } from '@react-email/components';
import type { JSX } from 'react';
import type { MailTemplateProps } from '../../types.ts';

type Props = MailTemplateProps['invite'];

export function subject(props: Props): string {
  return `${props.tenantName}: ${props.inviterName} invited you to Seta`;
}

export default function Invite(props: Props): JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={{ background: '#f6f7f9', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ maxWidth: 480, padding: 24, background: '#ffffff' }}>
          <Heading style={{ fontSize: 20, marginBottom: 12 }}>
            Join {props.tenantName} on Seta
          </Heading>
          <Text>{props.inviterName} invited you to join their workspace on Seta.</Text>
          <Button
            href={props.acceptUrl}
            style={{
              background: '#0047FF',
              color: '#ffffff',
              padding: '10px 16px',
              textDecoration: 'none',
              borderRadius: 6,
            }}
          >
            Accept invite
          </Button>
          <Text style={{ color: '#65676b', fontSize: 12 }}>Link expires {props.expiresAt}.</Text>
        </Container>
      </Body>
    </Html>
  );
}
