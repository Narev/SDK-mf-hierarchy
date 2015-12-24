/// <reference path='./typings/tsd.d.ts' />
/// <reference path="./typings/node/node.d.ts" />

import when = require("when");
import fs = require("fs");


export class FileWriter {

  private fileLocation;
  private stream;

  constructor( location:string ) {
      this.fileLocation = location;

      fs.stat(this.fileLocation, function(err, stat) {
          if(err == null) {
            var d =  (new Date());
            var newName = location.substr(0, location.lastIndexOf(".")) + d.getFullYear()+d.getMonth() + d.getDate() + "-" + d.getHours() + d.getMinutes() + location.substr(location.lastIndexOf("."));
              console.log("File exists, renaming: " + newName );
              fs.rename( location, newName );
          } else if(err.code == "ENOENT") {
              // fs.writeFile('log.txt', 'Some log\n');
          } else {
              console.log("Some other error: ", err.code);
          }
        });

  };

  public appendHeader( header:string ) {
    this.stream = fs.createWriteStream(this.fileLocation);
    this.stream.write( header + "\r\n");
  };

  public appendLine( line:string ) {
    this.stream.write( line + "\r\n" );
  }

  public close( ) {
    this.stream.close();
  }
}
