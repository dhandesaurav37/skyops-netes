package queue

import (
	"errors"
	"sync"
)

var (
	ErrQueueFull  = errors.New("telemetry queue is full; dropping oldest observation")
	ErrQueueEmpty = errors.New("queue is empty")
)

// Item wraps a batched payload or event
type Item struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// BoundedQueue is a thread-safe FIFO ring buffer
type BoundedQueue struct {
	mu       sync.Mutex
	capacity int
	items    []Item
}

func NewBoundedQueue(capacity int) *BoundedQueue {
	return &BoundedQueue{
		capacity: capacity,
		items:    make([]Item, 0, capacity),
	}
}

// Push adds an item. If full, drops the oldest item to preserve fresh observability state.
func (q *BoundedQueue) Push(item Item) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if len(q.items) >= q.capacity {
		// Evict oldest
		q.items = q.items[1:]
	}
	q.items = append(q.items, item)
}

// PopAll drains all available items atomically
func (q *BoundedQueue) PopAll() []Item {
	q.mu.Lock()
	defer q.mu.Unlock()

	if len(q.items) == 0 {
		return nil
	}

	drained := make([]Item, len(q.items))
	copy(drained, q.items)
	q.items = q.items[:0]
	return drained
}

// Size returns current queued items
func (q *BoundedQueue) Size() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.items)
}
