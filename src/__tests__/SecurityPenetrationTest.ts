import WebSocket from 'ws';
import { performance } from 'perf_hooks';

/**
 * SecurityPenetrationTest performs security vulnerability testing
 * including injection attacks, rate limiting, and data validation
 */
export class SecurityPenetrationTest {
  private vulnerabilities: Array<{
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    evidence?: string;
  }> = [];

  constructor(private serverUrl: string = 'ws://localhost:3001') {}

  /**
   * Test WebSocket message injection attacks
   */
  async testWebSocketInjection(): Promise<void> {
    console.log('🔍 Testing WebSocket injection vulnerabilities...');

    const ws = new WebSocket(this.serverUrl);
    
    return new Promise((resolve) => {
      ws.on('open', async () => {
        // Test SQL injection patterns
        const sqlInjectionPayloads = [
          "'; DROP TABLE players; --",
          "' OR '1'='1",
          "'; INSERT INTO players (name) VALUES ('hacker'); --",
          "' UNION SELECT * FROM players --"
        ];

        for (const payload of sqlInjectionPayloads) {
          try {
            ws.send(JSON.stringify({
              type: 'REGISTER',
              playerId: payload
            }));

            ws.send(JSON.stringify({
              type: 'JOIN_QUEUE',
              player: {
                id: payload,
                name: payload
              }
            }));
          } catch (error) {
            // Expected behavior - server should reject malformed messages
          }
        }

        // Test XSS injection patterns
        const xssPayloads = [
          "<script>alert('XSS')</script>",
          "javascript:alert('XSS')",
          "<img src=x onerror=alert('XSS')>",
          "';alert('XSS');//"
        ];

        for (const payload of xssPayloads) {
          try {
            ws.send(JSON.stringify({
              type: 'GAME_MESSAGE',
              matchId: 'test',
              message: payload
            }));
          } catch (error) {
            // Expected behavior
          }
        }

        // Test buffer overflow attempts
        const largePayload = 'A'.repeat(1000000); // 1MB payload
        try {
          ws.send(JSON.stringify({
            type: 'REGISTER',
            playerId: largePayload
          }));
          
          this.addVulnerability({
            type: 'Buffer Overflow',
            severity: 'HIGH',
            description: 'Server accepts extremely large payloads without validation',
            evidence: `Payload size: ${largePayload.length} bytes`
          });
        } catch (error) {
          // Good - server should reject large payloads
        }

        ws.close();
        resolve();
      });

      ws.on('error', () => {
        resolve();
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        resolve();
      }, 10000);
    });
  }

  /**
   * Test rate limiting vulnerabilities
   */
  async testRateLimiting(): Promise<void> {
    console.log('🔍 Testing rate limiting vulnerabilities...');

    const connections: WebSocket[] = [];
    const messagesSent: number[] = [];
    const startTime = performance.now();

    // Test connection flooding
    for (let i = 0; i < 100; i++) {
      try {
        const ws = new WebSocket(this.serverUrl);
        connections.push(ws);
        
        ws.on('open', () => {
          // Rapid message sending
          let messageCount = 0;
          const interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN && messageCount < 100) {
              ws.send(JSON.stringify({
                type: 'PING',
                timestamp: Date.now()
              }));
              messageCount++;
            } else {
              clearInterval(interval);
            }
          }, 10); // 100 messages per second

          messagesSent.push(messageCount);
        });
      } catch (error) {
        // Connection rejected - good security behavior
      }
    }

    // Wait for test completion
    await new Promise(resolve => setTimeout(resolve, 5000));

    const totalMessages = messagesSent.reduce((sum, count) => sum + count, 0);
    const testDuration = performance.now() - startTime;
    const messagesPerSecond = totalMessages / (testDuration / 1000);

    if (connections.length > 50) {
      this.addVulnerability({
        type: 'Connection Flooding',
        severity: 'MEDIUM',
        description: 'Server allows too many concurrent connections from single IP',
        evidence: `${connections.length} connections established`
      });
    }

    if (messagesPerSecond > 1000) {
      this.addVulnerability({
        type: 'Message Flooding',
        severity: 'HIGH',
        description: 'Server lacks proper rate limiting for messages',
        evidence: `${messagesPerSecond.toFixed(2)} messages/second achieved`
      });
    }

    // Clean up connections
    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
  }

  /**
   * Test authentication bypass attempts
   */
  async testAuthenticationBypass(): Promise<void> {
    console.log('🔍 Testing authentication bypass vulnerabilities...');

    const ws = new WebSocket(this.serverUrl);

    return new Promise((resolve) => {
      ws.on('open', () => {
        // Test accessing game functions without registration
        const unauthorizedActions = [
          { type: 'JOIN_QUEUE', player: { id: 'unregistered', name: 'Hacker' } },
          { type: 'GAME_DECISION', matchId: 'fake-match', decision: 'COOPERATE' },
          { type: 'GAME_MESSAGE', matchId: 'fake-match', message: 'Unauthorized message' },
          { type: 'REMATCH_REQUEST', matchId: 'fake-match' }
        ];

        let responseCount = 0;
        const expectedResponses = unauthorizedActions.length;

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            // If server processes unauthorized actions, it's a vulnerability
            if (message.type !== 'ERROR') {
              this.addVulnerability({
                type: 'Authentication Bypass',
                severity: 'CRITICAL',
                description: 'Server processes actions from unregistered clients',
                evidence: `Action processed: ${JSON.stringify(message)}`
              });
            }
            
            responseCount++;
            if (responseCount >= expectedResponses) {
              ws.close();
              resolve();
            }
          } catch (error) {
            // Ignore parsing errors
          }
        });

        // Send unauthorized actions
        unauthorizedActions.forEach((action, index) => {
          setTimeout(() => {
            ws.send(JSON.stringify(action));
          }, index * 100);
        });

        // Timeout
        setTimeout(() => {
          ws.close();
          resolve();
        }, 5000);
      });

      ws.on('error', () => {
        resolve();
      });
    });
  }

  /**
   * Test session hijacking vulnerabilities
   */
  async testSessionHijacking(): Promise<void> {
    console.log('🔍 Testing session hijacking vulnerabilities...');

    const ws1 = new WebSocket(this.serverUrl);
    const ws2 = new WebSocket(this.serverUrl);

    return new Promise((resolve) => {
      let player1Id: string;
      let matchId: string;

      ws1.on('open', () => {
        // Register first player
        ws1.send(JSON.stringify({
          type: 'REGISTER',
          playerId: 'player1'
        }));
      });

      ws1.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'REGISTERED') {
            player1Id = message.playerId;
            
            // Join queue
            ws1.send(JSON.stringify({
              type: 'JOIN_QUEUE',
              player: { id: player1Id, name: 'Player1' }
            }));
          } else if (message.type === 'MATCH_FOUND') {
            matchId = message.matchId;
            
            // Now try to hijack session with second connection
            ws2.send(JSON.stringify({
              type: 'REGISTER',
              playerId: player1Id // Same player ID
            }));
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });

      ws2.on('open', () => {
        // Wait for ws1 to establish session
      });

      ws2.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'REGISTERED') {
            // Try to make game decision with hijacked session
            ws2.send(JSON.stringify({
              type: 'GAME_DECISION',
              matchId: matchId,
              decision: 'BETRAY'
            }));

            // If this works, it's a session hijacking vulnerability
            this.addVulnerability({
              type: 'Session Hijacking',
              severity: 'CRITICAL',
              description: 'Multiple connections can use same player ID',
              evidence: `Player ID ${player1Id} used by multiple connections`
            });
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });

      // Clean up after 10 seconds
      setTimeout(() => {
        ws1.close();
        ws2.close();
        resolve();
      }, 10000);
    });
  }

  /**
   * Test data validation vulnerabilities
   */
  async testDataValidation(): Promise<void> {
    console.log('🔍 Testing data validation vulnerabilities...');

    const ws = new WebSocket(this.serverUrl);

    return new Promise((resolve) => {
      ws.on('open', () => {
        // Register first
        ws.send(JSON.stringify({
          type: 'REGISTER',
          playerId: 'test-player'
        }));

        setTimeout(() => {
          // Test invalid message types
          const invalidMessages = [
            { type: 'INVALID_TYPE' },
            { type: null },
            { type: 123 },
            { type: {} },
            { type: [] },
            // Missing required fields
            { type: 'JOIN_QUEUE' }, // Missing player
            { type: 'GAME_DECISION' }, // Missing matchId and decision
            // Invalid data types
            { type: 'JOIN_QUEUE', player: 'not-an-object' },
            { type: 'GAME_DECISION', matchId: 123, decision: null },
            // Extremely long strings
            { type: 'REGISTER', playerId: 'x'.repeat(10000) }
          ];

          let messageCount = 0;
          const sendNextMessage = () => {
            if (messageCount < invalidMessages.length) {
              try {
                ws.send(JSON.stringify(invalidMessages[messageCount]));
              } catch (error) {
                // Some messages might be too large to send
              }
              messageCount++;
              setTimeout(sendNextMessage, 100);
            } else {
              setTimeout(() => {
                ws.close();
                resolve();
              }, 1000);
            }
          };

          sendNextMessage();
        }, 1000);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Server should always respond with ERROR for invalid messages
          if (message.type !== 'ERROR' && message.type !== 'REGISTERED') {
            this.addVulnerability({
              type: 'Data Validation',
              severity: 'MEDIUM',
              description: 'Server processes invalid message formats',
              evidence: `Processed message: ${JSON.stringify(message)}`
            });
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });

      ws.on('error', () => {
        resolve();
      });
    });
  }

  /**
   * Test denial of service vulnerabilities
   */
  async testDenialOfService(): Promise<void> {
    console.log('🔍 Testing denial of service vulnerabilities...');

    // Test malformed JSON
    const ws = new WebSocket(this.serverUrl);

    return new Promise((resolve) => {
      ws.on('open', () => {
        const malformedMessages = [
          '{"type":"REGISTER"', // Incomplete JSON
          '{"type":}', // Invalid JSON
          '{type:"REGISTER"}', // Unquoted keys
          '{"type":"REGISTER","playerId":}', // Incomplete value
          'not json at all',
          '{"type":"REGISTER","playerId":"' + 'x'.repeat(100000) + '"}' // Extremely long string
        ];

        malformedMessages.forEach((msg, index) => {
          setTimeout(() => {
            try {
              ws.send(msg);
            } catch (error) {
              // Expected for some malformed messages
            }
          }, index * 100);
        });

        // Test rapid connection/disconnection
        for (let i = 0; i < 50; i++) {
          setTimeout(() => {
            const tempWs = new WebSocket(this.serverUrl);
            tempWs.on('open', () => {
              tempWs.close();
            });
          }, i * 10);
        }

        setTimeout(() => {
          ws.close();
          resolve();
        }, 10000);
      });

      ws.on('error', () => {
        resolve();
      });
    });
  }

  /**
   * Run comprehensive security test suite
   */
  async runSecurityTests(): Promise<{
    vulnerabilitiesFound: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    vulnerabilities: Array<any>;
  }> {
    console.log('🔒 Starting comprehensive security penetration testing...');

    this.vulnerabilities = [];

    try {
      await this.testWebSocketInjection();
      await this.wait(1000);

      await this.testRateLimiting();
      await this.wait(1000);

      await this.testAuthenticationBypass();
      await this.wait(1000);

      await this.testSessionHijacking();
      await this.wait(1000);

      await this.testDataValidation();
      await this.wait(1000);

      await this.testDenialOfService();
    } catch (error) {
      console.error('Security test error:', error);
    }

    const results = this.generateSecurityReport();
    console.log('🔒 Security testing completed');
    
    return results;
  }

  /**
   * Generate security report
   */
  private generateSecurityReport(): {
    vulnerabilitiesFound: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    vulnerabilities: Array<any>;
  } {
    const criticalCount = this.vulnerabilities.filter(v => v.severity === 'CRITICAL').length;
    const highCount = this.vulnerabilities.filter(v => v.severity === 'HIGH').length;
    const mediumCount = this.vulnerabilities.filter(v => v.severity === 'MEDIUM').length;
    const lowCount = this.vulnerabilities.filter(v => v.severity === 'LOW').length;

    console.log('\n🔒 Security Test Results:');
    console.log('========================');
    console.log(`Total Vulnerabilities: ${this.vulnerabilities.length}`);
    console.log(`Critical: ${criticalCount}`);
    console.log(`High: ${highCount}`);
    console.log(`Medium: ${mediumCount}`);
    console.log(`Low: ${lowCount}`);

    if (this.vulnerabilities.length > 0) {
      console.log('\nVulnerabilities Found:');
      this.vulnerabilities.forEach((vuln, index) => {
        console.log(`${index + 1}. [${vuln.severity}] ${vuln.type}: ${vuln.description}`);
        if (vuln.evidence) {
          console.log(`   Evidence: ${vuln.evidence}`);
        }
      });
    } else {
      console.log('✅ No vulnerabilities found!');
    }

    return {
      vulnerabilitiesFound: this.vulnerabilities.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      vulnerabilities: this.vulnerabilities
    };
  }

  /**
   * Add vulnerability to report
   */
  private addVulnerability(vulnerability: {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    evidence?: string;
  }): void {
    this.vulnerabilities.push(vulnerability);
  }

  /**
   * Wait for specified milliseconds
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default SecurityPenetrationTest;