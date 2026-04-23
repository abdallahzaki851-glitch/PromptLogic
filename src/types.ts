/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  uid: string;
  username: string;
  email: string;
  isAdmin: boolean;
  subscriptionActive: boolean;
  createdAt: any;
}

export interface Chat {
  id: number;
  title: string;
  created_at: string;
}

export interface Message {
  id: number;
  chat_id: number;
  role: 'user' | 'assistant';
  content: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}
