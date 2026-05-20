/** @jsxImportSource react */
import { Body, Button, Container, Head, Heading, Html, Text } from '@react-email/components';
import type { JSX } from 'react';
import type { MailTemplateProps } from '../../types.ts';

type Props = MailTemplateProps['verify-email'];

export function subject(props: Props): string {
  return `${props.displayName}, confirm your Seta email`;
}

export default function VerifyEmail(props: Props): JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={{ background: '#f6f7f9', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ maxWidth: 480, padding: 24, background: '#ffffff' }}>
          <Heading style={{ fontSize: 20, marginBottom: 12 }}>Confirm your email</Heading>
          <Text>
            Hi {props.displayName}, click the button below to confirm your email and finish signing
            in.
          </Text>
          <Button
            href={props.verifyUrl}
            style={{
              background: '#0047FF',
              color: '#ffffff',
              padding: '10px 16px',
              textDecoration: 'none',
              borderRadius: 6,
            }}
          >
            Confirm email
          </Button>
          <Text style={{ color: '#65676b', fontSize: 12 }}>Link expires {props.expiresAt}.</Text>
        </Container>
      </Body>
    </Html>
  );
}
