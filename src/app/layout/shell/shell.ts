import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopBar } from '../top-bar/top-bar';
import { BottomNav } from '../bottom-nav/bottom-nav';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, TopBar, BottomNav],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {}
