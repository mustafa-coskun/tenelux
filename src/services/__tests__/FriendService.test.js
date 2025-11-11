// Unit tests for FriendService
// Tests Requirements: 1.1, 2.1, 5.1, 6.1

const { FriendService } = require('../FriendService');

describe('FriendService', () => {
  let friendService;
  let mockDbManager;
  let mockAdapter;

  beforeEach(() => {
    mockAdapter = {
      findOne: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };

    mockDbManager = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter)
    };

    friendService = new FriendService(mockDbManager);
  });

  describe('sendFriendRequest', () => {
    const mockUser1 = { id: 'user1', username: 'player1' };
    const mockUser2 = { id: 'user2', username: 'player2' };

    beforeEach(() => {
      // Reset mocks for each test
      jest.clearAllMocks();
    });

    it('should send friend request successfully', async () => {
      mockAdapter.findOne
        .mockResolvedValueOnce(mockUser1) // fromUser
        .mockResolvedValueOnce(mockUser2) // toUser
        .mockResolvedValueOnce(null); // No existing friendship
      
      await friendService.sendFriendRequest('user1', 'user2');
      
      expect(mockAdapter.create).toHaveBeenCalledWith('friendships', expect.objectContaining({
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'pending'
      }));
    });

    it('should throw error when sending request to self', async () => {
      await expect(
        friendService.sendFriendRequest('user1', 'user1')
      ).rejects.toThrow('Cannot send friend request to yourself');
    });

    it('should throw error when user not found', async () => {
      mockAdapter.findOne
        .mockResolvedValueOnce(mockUser1)
        .mockResolvedValueOnce(null); // toUser not found
      
      await expect(
        friendService.sendFriendRequest('user1', 'user2')
      ).rejects.toThrow('User not found');
    });

    it('should throw error when already friends', async () => {
      mockAdapter.findOne
        .mockResolvedValueOnce(mockUser1) // fromUser
        .mockResolvedValueOnce(mockUser2) // toUser
        .mockResolvedValueOnce({
          id: 'friendship1',
          requester_id: 'user1',
          addressee_id: 'user2',
          status: 'accepted'
        });
      
      await expect(
        friendService.sendFriendRequest('user1', 'user2')
      ).rejects.toThrow('Already friends');
    });

    it('should throw error when request already sent', async () => {
      mockAdapter.findOne
        .mockResolvedValueOnce(mockUser1) // fromUser
        .mockResolvedValueOnce(mockUser2) // toUser
        .mockResolvedValueOnce({
          id: 'friendship1',
          requester_id: 'user1',
          addressee_id: 'user2',
          status: 'pending'
        });
      
      await expect(
        friendService.sendFriendRequest('user1', 'user2')
      ).rejects.toThrow('Friend request already sent');
    });

    it('should auto-accept mutual friend request', async () => {
      const existingFriendship = {
        id: 'friendship1',
        requester_id: 'user2',
        addressee_id: 'user1',
        status: 'pending'
      };
      
      mockAdapter.findOne
        .mockResolvedValueOnce(mockUser1) // fromUser
        .mockResolvedValueOnce(mockUser2) // toUser
        .mockResolvedValueOnce(existingFriendship) // existing friendship
        .mockResolvedValueOnce(existingFriendship); // for acceptFriendRequest
      
      await friendService.sendFriendRequest('user1', 'user2');
      
      expect(mockAdapter.update).toHaveBeenCalledWith(
        'friendships',
        { id: 'friendship1' },
        expect.objectContaining({ status: 'accepted' })
      );
    });

    it('should throw error when user is blocked', async () => {
      mockAdapter.findOne
        .mockResolvedValueOnce(mockUser1) // fromUser
        .mockResolvedValueOnce(mockUser2) // toUser
        .mockResolvedValueOnce({
          id: 'friendship1',
          requester_id: 'user1',
          addressee_id: 'user2',
          status: 'blocked'
        });
      
      await expect(
        friendService.sendFriendRequest('user1', 'user2')
      ).rejects.toThrow('Cannot send friend request to blocked user');
    });
  });

  describe('acceptFriendRequest', () => {
    it('should accept pending friend request', async () => {
      mockAdapter.findOne.mockResolvedValue({
        id: 'friendship1',
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'pending'
      });
      
      await friendService.acceptFriendRequest('friendship1');
      
      expect(mockAdapter.update).toHaveBeenCalledWith(
        'friendships',
        { id: 'friendship1' },
        expect.objectContaining({ status: 'accepted' })
      );
    });

    it('should throw error when request not found', async () => {
      mockAdapter.findOne.mockResolvedValue(null);
      
      await expect(
        friendService.acceptFriendRequest('friendship1')
      ).rejects.toThrow('Friend request not found');
    });

    it('should throw error when request is not pending', async () => {
      mockAdapter.findOne.mockResolvedValue({
        id: 'friendship1',
        status: 'accepted'
      });
      
      await expect(
        friendService.acceptFriendRequest('friendship1')
      ).rejects.toThrow('Friend request is not pending');
    });
  });

  describe('rejectFriendRequest', () => {
    it('should reject pending friend request', async () => {
      mockAdapter.findOne.mockResolvedValue({
        id: 'friendship1',
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'pending'
      });
      
      await friendService.rejectFriendRequest('friendship1');
      
      expect(mockAdapter.update).toHaveBeenCalledWith(
        'friendships',
        { id: 'friendship1' },
        expect.objectContaining({ status: 'rejected' })
      );
    });

    it('should throw error when request not found', async () => {
      mockAdapter.findOne.mockResolvedValue(null);
      
      await expect(
        friendService.rejectFriendRequest('friendship1')
      ).rejects.toThrow('Friend request not found');
    });
  });

  describe('removeFriend', () => {
    it('should remove friend successfully', async () => {
      mockAdapter.findOne.mockResolvedValue({
        id: 'friendship1',
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'accepted'
      });
      
      await friendService.removeFriend('user1', 'user2');
      
      expect(mockAdapter.delete).toHaveBeenCalledWith('friendships', { id: 'friendship1' });
    });

    it('should throw error when friendship not found', async () => {
      mockAdapter.findOne.mockResolvedValue(null);
      
      await expect(
        friendService.removeFriend('user1', 'user2')
      ).rejects.toThrow('Friendship not found');
    });
  });

  describe('getFriendsList', () => {
    it('should return friends list with details', async () => {
      const mockFriendships = [
        {
          id: 'friendship1',
          requester_id: 'user1',
          addressee_id: 'user2',
          status: 'accepted'
        },
        {
          id: 'friendship2',
          requester_id: 'user3',
          addressee_id: 'user1',
          status: 'accepted'
        }
      ];
      
      const mockFriend1 = {
        id: 'user2',
        username: 'player2',
        display_name: 'Player Two',
        avatar: '🎮',
        last_active: new Date().toISOString(),
        trust_score: 75
      };
      
      const mockFriend2 = {
        id: 'user3',
        username: 'player3',
        display_name: 'Player Three',
        avatar: '👤',
        last_active: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
        trust_score: 60
      };
      
      mockAdapter.findMany.mockResolvedValue(mockFriendships);
      mockAdapter.findOne
        .mockResolvedValueOnce(mockFriend1)
        .mockResolvedValueOnce(mockFriend2);
      
      const friends = await friendService.getFriendsList('user1');
      
      expect(friends).toHaveLength(2);
      expect(friends[0]).toMatchObject({
        id: 'user2',
        username: 'player2',
        displayName: 'Player Two',
        trustScore: 75,
        isOnline: true
      });
      expect(friends[1]).toMatchObject({
        id: 'user3',
        username: 'player3',
        isOnline: false
      });
    });

    it('should return empty array when no friends', async () => {
      mockAdapter.findMany.mockResolvedValue([]);
      
      const friends = await friendService.getFriendsList('user1');
      
      expect(friends).toEqual([]);
    });
  });

  describe('getPendingRequests', () => {
    it('should return sent and received requests', async () => {
      const mockSentRequests = [
        {
          id: 'friendship1',
          requester_id: 'user1',
          addressee_id: 'user2',
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ];
      
      const mockReceivedRequests = [
        {
          id: 'friendship2',
          requester_id: 'user3',
          addressee_id: 'user1',
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ];
      
      const mockUser2 = { id: 'user2', username: 'player2', display_name: 'Player Two' };
      const mockUser3 = { id: 'user3', username: 'player3', display_name: 'Player Three' };
      
      mockAdapter.findMany
        .mockResolvedValueOnce(mockSentRequests)
        .mockResolvedValueOnce(mockReceivedRequests);
      
      mockAdapter.findOne
        .mockResolvedValueOnce(mockUser2)
        .mockResolvedValueOnce(mockUser3);
      
      const requests = await friendService.getPendingRequests('user1');
      
      expect(requests.sent).toHaveLength(1);
      expect(requests.received).toHaveLength(1);
      expect(requests.sent[0]).toMatchObject({
        id: 'friendship1',
        username: 'player2'
      });
      expect(requests.received[0]).toMatchObject({
        id: 'friendship2',
        username: 'player3'
      });
    });
  });

  describe('blockUser', () => {
    const mockUser1 = { id: 'user1', username: 'player1' };
    const mockUser2 = { id: 'user2', username: 'player2' };

    beforeEach(() => {
      mockAdapter.findOne
        .mockResolvedValueOnce(mockUser1)
        .mockResolvedValueOnce(mockUser2);
    });

    it('should block user successfully', async () => {
      mockAdapter.findOne.mockResolvedValueOnce(null); // No existing friendship
      
      await friendService.blockUser('user1', 'user2');
      
      expect(mockAdapter.create).toHaveBeenCalledWith('friendships', expect.objectContaining({
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'blocked'
      }));
    });

    it('should update existing friendship to blocked', async () => {
      mockAdapter.findOne.mockResolvedValueOnce({
        id: 'friendship1',
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'accepted'
      });
      
      await friendService.blockUser('user1', 'user2');
      
      expect(mockAdapter.update).toHaveBeenCalledWith(
        'friendships',
        { id: 'friendship1' },
        expect.objectContaining({ status: 'blocked' })
      );
    });

    it('should throw error when blocking self', async () => {
      await expect(
        friendService.blockUser('user1', 'user1')
      ).rejects.toThrow('Cannot block yourself');
    });
  });

  describe('getFriendStatus', () => {
    it('should return correct status for different friendship states', async () => {
      // Test pending sent
      mockAdapter.findOne.mockResolvedValueOnce({
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'pending'
      });
      
      let status = await friendService.getFriendStatus('user1', 'user2');
      expect(status.status).toBe('pending_sent');
      expect(status.canSendRequest).toBe(false);
      
      // Test pending received
      mockAdapter.findOne.mockResolvedValueOnce({
        requester_id: 'user2',
        addressee_id: 'user1',
        status: 'pending'
      });
      
      status = await friendService.getFriendStatus('user1', 'user2');
      expect(status.status).toBe('pending_received');
      expect(status.canAccept).toBe(true);
      
      // Test accepted
      mockAdapter.findOne.mockResolvedValueOnce({
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'accepted'
      });
      
      status = await friendService.getFriendStatus('user1', 'user2');
      expect(status.status).toBe('accepted');
      
      // Test no relationship
      mockAdapter.findOne.mockResolvedValueOnce(null);
      
      status = await friendService.getFriendStatus('user1', 'user2');
      expect(status.status).toBe('none');
      expect(status.canSendRequest).toBe(true);
    });
  });

  describe('searchUsers', () => {
    it('should search users and return friendship status', async () => {
      const mockUsers = [
        {
          id: 'user2',
          username: 'player2',
          display_name: 'Player Two',
          avatar: '🎮',
          trust_score: 75,
          total_games: 20,
          is_guest: 0
        },
        {
          id: 'user3',
          username: 'player3',
          display_name: 'Player Three',
          avatar: '👤',
          trust_score: 60,
          total_games: 15,
          is_guest: 0
        }
      ];
      
      mockAdapter.findMany.mockResolvedValue(mockUsers);
      mockAdapter.findOne
        .mockResolvedValueOnce({ status: 'accepted' }) // user2 friendship
        .mockResolvedValueOnce(null); // user3 no friendship
      
      const results = await friendService.searchUsers('player', 'user1');
      
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        id: 'user2',
        username: 'player2',
        isFriend: true
      });
      expect(results[1]).toMatchObject({
        id: 'user3',
        username: 'player3',
        isFriend: false
      });
    });

    it('should exclude current user from search results', async () => {
      const mockUsers = [
        { id: 'user1', username: 'player1', is_guest: 0 },
        { id: 'user2', username: 'player2', is_guest: 0 }
      ];
      
      mockAdapter.findMany.mockResolvedValue(mockUsers);
      mockAdapter.findOne.mockResolvedValue(null);
      
      const results = await friendService.searchUsers('player', 'user1');
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('user2');
    });
  });

  describe('isUserOnline', () => {
    it('should correctly determine online status', () => {
      const now = new Date();
      const recentTime = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago
      const oldTime = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago
      
      expect(friendService.isUserOnline(recentTime)).toBe(true);
      expect(friendService.isUserOnline(oldTime)).toBe(false);
      expect(friendService.isUserOnline(recentTime.toISOString())).toBe(true);
      expect(friendService.isUserOnline(oldTime.toISOString())).toBe(false);
    });
  });
});