import express from 'express';
import request from 'supertest';
import { jsonBigIntReplacer } from '../../src/common/utils/json-serialization';

describe('jsonBigIntReplacer', () => {
  it('serializes nested bigint values as strings', () => {
    expect(
      JSON.stringify(
        {
          id: 9007199254740993n,
          nested: {
            values: [1n, 2n],
          },
        },
        jsonBigIntReplacer,
      ),
    ).toBe('{"id":"9007199254740993","nested":{"values":["1","2"]}}');
  });

  it('allows Express res.json to reply with bigint values', async () => {
    const app = express();
    app.set('json replacer', jsonBigIntReplacer);
    app.get('/bigint', (_req, res) => {
      res.json({
        data: {
          id: 9007199254740993n,
        },
      });
    });

    const response = await request(app).get('/bigint').expect(200);

    expect(response.body).toEqual({
      data: {
        id: '9007199254740993',
      },
    });
  });
});
