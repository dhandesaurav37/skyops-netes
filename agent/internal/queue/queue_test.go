package queue_test

import (
	"testing"

	"github.com/skyops-io/skyops/agent/internal/queue"
)

func TestBoundedQueue_PushAndPopAll(t *testing.T) {
	q := queue.NewBoundedQueue(3)

	if q.Size() != 0 {
		t.Errorf("expected empty queue size 0, got %d", q.Size())
	}

	q.Push(queue.Item{Type: "TEST", Payload: "1"})
	q.Push(queue.Item{Type: "TEST", Payload: "2"})
	q.Push(queue.Item{Type: "TEST", Payload: "3"})

	if q.Size() != 3 {
		t.Errorf("expected queue size 3, got %d", q.Size())
	}

	// Pushing a 4th item when capacity is 3 should evict the oldest item ("1")
	q.Push(queue.Item{Type: "TEST", Payload: "4"})

	if q.Size() != 3 {
		t.Errorf("expected queue size 3 after eviction, got %d", q.Size())
	}

	items := q.PopAll()
	if len(items) != 3 {
		t.Fatalf("expected 3 items popped, got %d", len(items))
	}

	if items[0].Payload != "2" || items[1].Payload != "3" || items[2].Payload != "4" {
		t.Errorf("unexpected items payload sequence: %+v", items)
	}

	if q.Size() != 0 {
		t.Errorf("expected queue size 0 after PopAll, got %d", q.Size())
	}
}
