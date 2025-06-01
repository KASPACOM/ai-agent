import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { InputEvent, OutputResponse } from './models/message.model';
import { filter } from 'rxjs/operators';

@Injectable()
export class MessageBus {
  private inputSubject = new Subject<InputEvent>();
  private responseSubject = new Subject<OutputResponse>();

  // Methods for submitting messages
  submitInput(input: InputEvent): void {
    this.inputSubject.next(input);
  }

  // Methods for subscribing to messages
  getInputs(): Observable<InputEvent> {
    return this.inputSubject.asObservable();
  }

  getResponses(): Observable<OutputResponse> {
    return this.responseSubject.asObservable();
  }

  getResponsesForChat(chatId: string): Observable<OutputResponse> {
    return this.responseSubject
      .asObservable()
      .pipe(filter((response) => response.chatId === chatId));
  }

  // Method for publishing responses
  publishResponse(response: OutputResponse): void {
    this.responseSubject.next(response);
  }
}
