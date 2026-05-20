/** @jsxImportSource react */
import { Body, Button, Container, Head, Heading, Html, Text } from '@react-email/components';
import type { JSX } from 'react';
import type { MailTemplateProps } from '../../types.ts';

type Props = MailTemplateProps['password-reset'];

export function subject(_props: Props): string {
  return 'Reset your Seta password';
}

export default function PasswordReset(props: Props): JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={{ background: '#f6f7f9', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ maxWidth: 480, padding: 24, background: '#ffffff' }}>
          <Heading style={{ fontSize: 20, marginBottom: 12 }}>Reset your password</Heading>
          <Text>Hi {props.displayName}, click the button below to reset your password.</Text>
          <Button
            href={props.resetUrl}
            style={{
              background: '#0047FF',
              color: '#ffffff',
              padding: '10px 16px',
              textDecoration: 'none',
              borderRadius: 6,
            }}
          >
            Reset password
          </Button>
          <Text style={{ color: '#65676b', fontSize: 12 }}>
            Link expires {props.expiresAt}. Requested from IP {props.requestedFromIp}. If you didn't
            request this, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
