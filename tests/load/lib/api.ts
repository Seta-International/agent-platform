import http, { type Response } from 'k6/http';
import { BASE_URL } from '../config.ts';

type Tags = Record<string, string>;
const json = (tags?: Tags) => ({
  headers: { 'Content-Type': 'application/json' },
  tags,
});

export const get = (path: string, tags?: Tags): Response =>
  http.get(`${BASE_URL}${path}`, { tags });

export const post = (path: string, body: unknown, tags?: Tags): Response =>
  http.post(`${BASE_URL}${path}`, JSON.stringify(body), json(tags));

export const patch = (path: string, body: unknown, tags?: Tags): Response =>
  http.patch(`${BASE_URL}${path}`, JSON.stringify(body), json(tags));

export const del = (path: string, body: unknown, tags?: Tags): Response =>
  http.del(`${BASE_URL}${path}`, JSON.stringify(body), json(tags));
