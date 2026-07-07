export interface IEvent {
  id: string;
  name: string;
  description?: string | null;
  eventDate: Date;
  totalSeats: number;
  remainingSeats: number;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}
